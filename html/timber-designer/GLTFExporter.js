/**
 * THREE.GLTFExporter standalone module for browser
 */
( function () {

	class GLTFExporter {

		constructor() {

			this.pluginCallbacks = [];

		}

		register( callback ) {

			if ( this.pluginCallbacks.indexOf( callback ) === - 1 ) {

				this.pluginCallbacks.push( callback );

			}

			return this;

		}

		unregister( callback ) {

			if ( this.pluginCallbacks.indexOf( callback ) !== - 1 ) {

				this.pluginCallbacks.splice( this.pluginCallbacks.indexOf( callback ), 1 );

			}

			return this;

		}

		parse( input, onDone, onError, options ) {

			const DEFAULT_OPTIONS = {
				binary: true,
				trs: false,
				onlyVisible: true,
				truncateDrawRange: true,
				embedImages: true,
				maxTextureSize: Infinity
			};

			options = Object.assign( {}, DEFAULT_OPTIONS, options );

			if ( options.onlyVisible === undefined ) options.onlyVisible = true;

			const pending = [];
			const outputObject = {
				asset: {
					version: '2.0',
					generator: 'JU Housing Timber Designer GLTFExporter'
				},
				scenes: [],
				nodes: [],
				materials: [],
				meshes: [],
				textures: [],
				images: [],
				accessors: [],
				bufferViews: [],
				buffers: []
			};

			const json = outputObject;
			const buffers = [];

			const scene = {
				nodes: []
			};

			json.scenes.push( scene );

			function processScene( object ) {

				object.traverse( function ( child ) {

					if ( options.onlyVisible && child.visible === false ) return;

					if ( child.isMesh ) {

						const geometry = child.geometry;
						const material = child.material;

						if ( geometry && material ) {

							const meshNode = {
								name: child.name || 'TimberElement',
								translation: [ child.position.x, child.position.y, child.position.z ],
								rotation: [ child.quaternion.x, child.quaternion.y, child.quaternion.z, child.quaternion.w ],
								scale: [ child.scale.x, child.scale.y, child.scale.z ]
							};

							json.nodes.push( meshNode );
							scene.nodes.push( json.nodes.length - 1 );

						}

					}

				} );

			}

			// Export input object(s)
			if ( Array.isArray( input ) ) {

				for ( let i = 0; i < input.length; i ++ ) {

					processScene( input[ i ] );

				}

			} else {

				processScene( input );

			}

			// Simple binary GLB / JSON exporter implementation for Three.js elements
			if ( options.binary ) {

				// Build minimal valid GLB buffer
				const jsonString = JSON.stringify( json );

				// Align to 4-byte boundary
				let jsonAligned = jsonString;
				while ( jsonAligned.length % 4 !== 0 ) jsonAligned += ' ';

				const jsonBuffer = new TextEncoder().encode( jsonAligned );
				const jsonLen = jsonBuffer.byteLength;

				const headerLen = 12;
				const chunk0HeaderLen = 8;
				const totalLen = headerLen + chunk0HeaderLen + jsonLen;

				const glbBuffer = new ArrayBuffer( totalLen );
				const view = new DataView( glbBuffer );

				// Magic: 'glTF' (0x46546C67)
				view.setUint32( 0, 0x46546C67, true );
				// Version: 2
				view.setUint32( 4, 2, true );
				// Total length
				view.setUint32( 8, totalLen, true );

				// Chunk 0 length
				view.setUint32( 12, jsonLen, true );
				// Chunk 0 type: 'JSON' (0x4E4F534A)
				view.setUint32( 16, 0x4E4F534A, true );

				// Copy JSON chunk
				const uint8View = new Uint8Array( glbBuffer, 20, jsonLen );
				uint8View.set( jsonBuffer );

				onDone( glbBuffer );

			} else {

				onDone( json );

			}

		}

	}

	THREE.GLTFExporter = GLTFExporter;

} )();
