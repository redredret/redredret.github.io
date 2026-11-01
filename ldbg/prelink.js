// Links the boot's shader programs while the game is still downloading, so the
// engine's own links a moment later are hits in the browser's program cache
// (docs/BROWSER_CLIENT.md, "Shader pre-link"; docs/BOOT_SPEED_AUDIT.md, B1).
//
// A cold browser used to spend 20-24 s of the boot blocked on the GPU process:
// Godot compiles a program and draws with it in the same frame, so every first
// link held the page until it was done, one at a time. This links the same
// programs first, in a Worker on its own OffscreenCanvas context, many at once
// with KHR_parallel_shader_compile, asking only COMPLETION_STATUS (which never
// waits). Chrome's program cache belongs to the GPU process, so the engine's
// context finds them there. Nothing of it runs on the page's thread: parsing
// the manifest, rebuilding the sources and every WebGL call are the Worker's.
//
// It links every program on every boot, warm or cold. On a warm browser
// they are cache hits and cost the page nothing (measured: warm boots as fast
// as without it), and a browser restarted after a first visit can come back
// partly warm -- six programs cached and dozens not -- which a sample of a
// few could not tell from fully warm (measured: 6.9 s of the engine's links
// came back when a six-program probe said "warm" and stopped).
//
// The manifest (prelink-<hash>.json, named by data-manifest on this script's
// tag) is recorded by the deploy from a boot of the very export it publishes
// (tools/web_publish/fingerprint.mjs): each program's two sources as runs of
// shared lines, its attribute bindings, and the extensions the engine's context
// enables -- which this context must enable too, or the cache key differs and
// nothing hits. With no manifest, no Worker, no WebGL2 or no parallel compile
// this does nothing. A program the manifest lacks the engine links itself, as it
// always did: a smaller gain, never a hitch.
(function () {
	'use strict';

	// Every program's sources, rebuilt from the manifest's shared lines; each
	// text only when first asked for.
	function decode(manifest) {
		if (!manifest || manifest.version !== 1 || !Array.isArray(manifest.lines)
			|| !Array.isArray(manifest.texts) || !Array.isArray(manifest.programs)) {
			throw new Error('Not a pre-link manifest this page knows.');
		}
		const lines = manifest.lines;
		const built = [];
		const text = function (index) {
			if (built[index] === undefined) {
				const spans = manifest.texts[index];
				const out = [];
				for (let k = 0; k < spans.length; k += 2) {
					for (let j = 0; j < spans[k + 1]; j++) {
						out.push(lines[spans[k] + j]);
					}
				}
				built[index] = out.join('\n');
			}
			return built[index];
		};
		return manifest.programs.map(function (entry) {
			return {
				get vertex() { return text(entry[0]); },
				get fragment() { return text(entry[1]); },
				bindings: entry[2] || [],
				feedback: entry[3] || null,
				// How much there is to compile, from the run lengths alone.
				size: [entry[0], entry[1]].reduce(function (sum, index) {
					const spans = manifest.texts[index];
					for (let k = 1; k < spans.length; k += 2) {
						sum += spans[k];
					}
					return sum;
				}, 0),
			};
		});
	}

	// The Worker. Self-contained: it is sent as source, with decode beside it.
	function work(decode) {
		// At most this many programs in flight at once.
		const IN_FLIGHT = 64;
		const POLL_MS = 16;
		const COMPLETION_STATUS = 0x91B1;
		const report = function (state) {
			postMessage(state);
		};
		onmessage = function (event) {
			const url = event.data.url;
			// Only ever set by tools/measure_web_boot.mjs, which salts every
			// shader source of a boot it measures cold; a pre-link that did not
			// salt alike could never hit.
			const salt = event.data.salt ? '\n// ' + event.data.salt + '\n' : '';
			let gl = null;
			try {
				gl = new OffscreenCanvas(1, 1).getContext('webgl2');
			} catch (err) {
				gl = null;
			}
			if (!gl) {
				report({ skipped: 'no WebGL2', done: true });
				return;
			}
			const finish = function (state) {
				const lose = gl.getExtension('WEBGL_lose_context');
				if (lose) {
					lose.loseContext();
				}
				state.done = true;
				report(state);
			};
			if (!gl.getExtension('KHR_parallel_shader_compile')) {
				finish({ skipped: 'no parallel compile' });
				return;
			}
			fetch(url).then(function (response) {
				return response.ok ? response.json() : Promise.reject(new Error('manifest ' + response.status));
			}).then(function (manifest) {
				(manifest.extensions || []).forEach(function (name) {
					gl.getExtension(name);
				});
				const programs = decode(manifest);
				// The largest first: they take longest to link cold, so starting
				// them first finishes the whole set soonest.
				const order = programs.slice().sort(function (a, b) {
					return b.size - a.size;
				});
				let linked = 0;
				const link = function (entry) {
					const program = gl.createProgram();
					const vertex = gl.createShader(gl.VERTEX_SHADER);
					const fragment = gl.createShader(gl.FRAGMENT_SHADER);
					gl.shaderSource(vertex, entry.vertex + salt);
					gl.shaderSource(fragment, entry.fragment + salt);
					gl.compileShader(vertex);
					gl.compileShader(fragment);
					gl.attachShader(program, vertex);
					gl.attachShader(program, fragment);
					entry.bindings.forEach(function (binding) {
						gl.bindAttribLocation(program, binding[0], binding[1]);
					});
					if (entry.feedback) {
						gl.transformFeedbackVaryings(program, entry.feedback[0], entry.feedback[1]);
					}
					gl.linkProgram(program);
					return [program, vertex, fragment];
				};
				const pending = [];
				let next = 0;
				const issue = function () {
					while (next < order.length && pending.length < IN_FLIGHT) {
						pending.push(link(order[next++]));
					}
				};
				const poll = function () {
					if (gl.isContextLost()) {
						finish({ skipped: 'context lost', programs: programs.length, linked: linked });
						return;
					}
					for (let i = pending.length - 1; i >= 0; i--) {
						const entry = pending[i];
						if (gl.getProgramParameter(entry[0], COMPLETION_STATUS)) {
							gl.deleteShader(entry[1]);
							gl.deleteShader(entry[2]);
							gl.deleteProgram(entry[0]);
							pending.splice(i, 1);
							linked++;
						}
					}
					issue();
					if (pending.length > 0) {
						setTimeout(poll, POLL_MS);
					} else {
						finish({ skipped: '', programs: programs.length, linked: linked });
					}
				};
				issue();
				setTimeout(poll, POLL_MS);
			}).catch(function () {
				// A missing or unreadable manifest costs only the gain.
				finish({ skipped: 'manifest unreadable' });
			});
		};
	}

	const state = { programs: 0, linked: 0, startedAt: 0, doneAt: 0, skipped: '' };
	window.LDBGPrelink = { decode: decode, state: state };

	const script = document.currentScript;
	const name = script && script.dataset ? script.dataset.manifest : '';
	if (!name) {
		state.skipped = 'no manifest';
		return;
	}
	if (typeof Worker !== 'function' || typeof OffscreenCanvas !== 'function') {
		state.skipped = 'no worker canvas';
		return;
	}
	let worker = null;
	let source = null;
	try {
		source = URL.createObjectURL(new Blob(['(' + work.toString() + ')(' + decode.toString() + ');'], { type: 'text/javascript' }));
		worker = new Worker(source);
	} catch (err) {
		state.skipped = 'no worker';
		return;
	}
	state.startedAt = Math.round(performance.now());
	worker.onmessage = function (event) {
		Object.assign(state, event.data);
		if (event.data.done) {
			state.doneAt = Math.round(performance.now());
			worker.terminate();
			URL.revokeObjectURL(source);
		}
	};
	worker.onerror = function () {
		state.skipped = 'worker failed';
		worker.terminate();
		URL.revokeObjectURL(source);
	};
	worker.postMessage({ url: new URL(name, document.baseURI).href, salt: window.__ldbgShaderSalt || '' });
}());
