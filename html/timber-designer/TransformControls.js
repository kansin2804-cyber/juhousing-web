/**
 * THREE.TransformControls standalone module for browser
 */
( function () {

	class TransformControls extends THREE.Object3D {

		constructor( camera, domElement ) {

			super();

			if ( domElement === undefined ) {

				console.warn( 'THREE.TransformControls: second parameter "domElement" is now mandatory.' );
				domElement = document;

			}

			this.isTransformControls = true;
			this.visible = false;

			const _gizmo = new THREE.Object3D();
			this.add( _gizmo );

			const _plane = new THREE.Mesh(
				new THREE.PlaneGeometry( 100000, 100000, 2, 2 ),
				new THREE.MeshBasicMaterial( { visible: false, wireframe: true, side: THREE.DoubleSide, transparent: true, opacity: 0 } )
			);
			_plane.name = 'transform_plane';
			this.add( _plane );

			this.camera = camera;
			this.domElement = domElement;
			this.object = undefined;
			this.enabled = true;
			this.axis = null;
			this.mode = 'translate';
			this.space = 'world';

			const scope = this;

			this.attach = function ( object ) {

				scope.object = object;
				scope.visible = true;
				return scope;

			};

			this.detach = function () {

				scope.object = undefined;
				scope.visible = false;
				scope.axis = null;
				return scope;

			};

			this.getMode = function () {

				return scope.mode;

			};

			this.setMode = function ( mode ) {

				scope.mode = mode;

			};

			this.dispose = function () {

				scope.detach();

			};

		}

	}

	THREE.TransformControls = TransformControls;

} )();
