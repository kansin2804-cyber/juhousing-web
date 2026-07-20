// 3D Rendering Module using Three.js for Timber House Designer
let scene, camera, renderer, controls;
let woodMaterial, sheathingMaterial, groundMaterial, concreteMaterial;
let elementsGroup; // Group containing all user-drawn elements

// Initialize the 3D Viewer
function init3D(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Create Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d0d0f);
    // Add Fog for depth
    scene.fog = new THREE.FogExp2(0x0d0d0f, 0.0001);

    // Create Camera
    camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 100, 100000);
    camera.position.set(4000, 3000, 5000); // Orbit starting point in mm

    // Create Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    container.innerHTML = ''; // Clear container
    container.appendChild(renderer.domElement);

    // Add Orbit Controls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.screenSpacePanning = true; // Make panning extremely natural
    controls.maxPolarAngle = Math.PI / 2 + 0.25; // Allow looking slightly upward from underneath ground to inspect foundation
    controls.minDistance = 500;
    controls.maxDistance = 30000;
    controls.rotateSpeed = 0.7;
    controls.panSpeed = 0.9;

    // SketchUp-style navigation (middle/left drag = orbit, right/Shift = pan,
    // wheel = zoom toward cursor). Our own wheel handler does zoom-to-cursor,
    // so OrbitControls' built-in zoom is disabled to avoid double-zooming.
    setupSketchUpControls();


    // Add Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight1.position.set(5000, 10000, 7500);
    dirLight1.castShadow = true;
    dirLight1.shadow.mapSize.width = 2048;
    dirLight1.shadow.mapSize.height = 2048;
    dirLight1.shadow.camera.near = 100;
    dirLight1.shadow.camera.far = 40000;
    const d = 15000; // shadow camera scope in mm
    dirLight1.shadow.camera.left = -d;
    dirLight1.shadow.camera.right = d;
    dirLight1.shadow.camera.top = d;
    dirLight1.shadow.camera.bottom = -d;
    dirLight1.shadow.bias = -0.0005;
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.2);
    dirLight2.position.set(-5000, 5000, -5000);
    scene.add(dirLight2);

    // Create Materials
    createMaterials();

    // Add Ground Grid / Floor
    const gridHelper = new THREE.GridHelper(30000, 100, 0x3e3e4a, 0x22222a);
    gridHelper.position.y = -1;
    scene.add(gridHelper);

    const groundGeo = new THREE.PlaneGeometry(60000, 60000);
    const ground = new THREE.Mesh(groundGeo, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Add Elements Group
    elementsGroup = new THREE.Group();
    scene.add(elementsGroup);

    // Handle Window Resize
    window.addEventListener('resize', () => {
        if (!container || !renderer) return;
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
    });

    // Start Animation Loop
    animate();
}

// ============================================================
// SKETCHUP-STYLE NAVIGATION
//   - Left drag / Middle drag : Orbit
//   - Right drag / Shift+drag : Pan
//   - Mouse wheel             : Zoom toward cursor (zoom-to-cursor)
//   - Two-finger touch        : Pan + pinch zoom
// ============================================================
const _zoomRaycaster = new THREE.Raycaster();
const _groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

function setupSketchUpControls() {
    if (!controls || !renderer) return;

    // Middle AND left button orbit (laptop-friendly); right button pans.
    controls.mouseButtons = {
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.ROTATE,
        RIGHT: THREE.MOUSE.PAN
    };
    // One finger orbit, two fingers pan + pinch-zoom (like SketchUp mobile).
    controls.touches = {
        ONE: THREE.TOUCH.ROTATE,
        TWO: THREE.TOUCH.DOLLY_PAN
    };

    // Disable OrbitControls' built-in wheel zoom; we do zoom-to-cursor instead.
    controls.enableZoom = false;
    renderer.domElement.addEventListener('wheel', onZoomToCursorWheel, { passive: false });

    // Hold Shift to temporarily turn orbit drags into pan drags (SketchUp habit).
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Shift' && controls) {
            controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
            controls.mouseButtons.MIDDLE = THREE.MOUSE.PAN;
        }
    });
    window.addEventListener('keyup', (e) => {
        if (e.key === 'Shift' && controls) {
            controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
            controls.mouseButtons.MIDDLE = THREE.MOUSE.ROTATE;
        }
    });
}

// Find the world-space point currently under the cursor: prefer a real model
// surface, fall back to the ground plane, then to the current view distance.
function worldPointUnderCursor(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1
    );
    _zoomRaycaster.setFromCamera(ndc, camera);

    if (elementsGroup && elementsGroup.children.length > 0) {
        const hits = _zoomRaycaster.intersectObjects(elementsGroup.children, true);
        if (hits.length > 0) return hits[0].point.clone();
    }
    const pt = new THREE.Vector3();
    if (_zoomRaycaster.ray.intersectPlane(_groundPlane, pt)) return pt;
    return _zoomRaycaster.ray.at(camera.position.distanceTo(controls.target), new THREE.Vector3());
}

// Zoom toward the cursor: scale both camera and target about the point under
// the cursor, keeping that point fixed on screen (true SketchUp behaviour).
function onZoomToCursorWheel(event) {
    if (!camera || !controls) return;
    event.preventDefault();

    const p = worldPointUnderCursor(event.clientX, event.clientY);
    const curDist = camera.position.distanceTo(controls.target);

    // Normalise wheel delta across devices; scroll up (deltaY<0) zooms in.
    const step = event.deltaY < 0 ? 0.82 : 1 / 0.82;
    let newDist = curDist * step;
    newDist = Math.max(controls.minDistance, Math.min(controls.maxDistance, newDist));
    const f = curDist > 0 ? newDist / curDist : 1;
    if (f === 1) return;

    camera.position.sub(p).multiplyScalar(f).add(p);
    controls.target.sub(p).multiplyScalar(f).add(p);
    controls.update();
}

// Generate Procedural Wood Texture
function createWoodTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    
    // Wood light brown base
    ctx.fillStyle = '#e5b37a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw wood grain lines
    ctx.strokeStyle = '#b27b43';
    ctx.lineWidth = 1.0;
    for (let i = 0; i < 20; i++) {
        ctx.beginPath();
        let x = Math.random() * canvas.width;
        ctx.moveTo(x, 0);
        for (let y = 0; y <= canvas.height; y += 30) {
            x += Math.sin(y * 0.03 + i) * 1.5;
            ctx.lineTo(x, y);
        }
        ctx.stroke();
    }

    // Add random wood knots
    ctx.fillStyle = 'rgba(150, 95, 45, 0.4)';
    for (let i = 0; i < 3; i++) {
        let kx = Math.random() * canvas.width;
        let ky = Math.random() * canvas.height;
        ctx.beginPath();
        ctx.ellipse(kx, ky, 8 + Math.random() * 8, 20 + Math.random() * 20, 0.1, 0, Math.PI * 2);
        ctx.fill();
    }
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, 4);
    return texture;
}

// Create Materials
function createMaterials() {
    const woodTex = createWoodTexture();
    
    woodMaterial = new THREE.MeshStandardMaterial({
        map: woodTex,
        roughness: 0.7,
        metalness: 0.1,
        color: 0xffe2c4
    });

    sheathingMaterial = new THREE.MeshPhysicalMaterial({
        color: 0xadcbe3,
        transparent: true,
        opacity: 0.2,
        roughness: 0.2,
        transmission: 0.6,
        thickness: 10,
        side: THREE.DoubleSide,
        depthWrite: false
    });

    groundMaterial = new THREE.MeshStandardMaterial({
        color: 0x141418,
        roughness: 0.9,
        metalness: 0.1
    });

    concreteMaterial = new THREE.MeshStandardMaterial({
        color: 0x8a8a92,
        roughness: 0.85,
        metalness: 0.1
    });
}

// Render Loop
function animate() {
    requestAnimationFrame(animate);
    if (controls) controls.update();
    if (renderer && scene && camera) {
        renderer.render(scene, camera);
    }
}

// Change Theme Background
function set3DTheme(isDark) {
    if (!scene) return;
    const color = isDark ? 0x0d0d0f : 0xf1f3f5;
    scene.background.setHex(color);
    scene.fog.color.setHex(color);
    if (groundMaterial) {
        groundMaterial.color.setHex(isDark ? 0x141418 : 0xe9ecef);
    }
}

function getFloorOffset(floorStr, walls) {
    if (floorStr === '2') {
        const f1Walls = walls.filter(w => (w.floor || '1') === '1');
        const maxH = f1Walls.length > 0 ? Math.max(...f1Walls.map(w => w.height)) : 2400;
        return maxH;
    }
    if (floorStr === '3') {
        const f1Walls = walls.filter(w => (w.floor || '1') === '1');
        const maxH1 = f1Walls.length > 0 ? Math.max(...f1Walls.map(w => w.height)) : 2400;
        const f2Walls = walls.filter(w => (w.floor || '1') === '2');
        const maxH2 = f2Walls.length > 0 ? Math.max(...f2Walls.map(w => w.height)) : 2400;
        return maxH1 + maxH2;
    }
    return 0;
}

// Rebuild the 3D Scene from 2D data
function renderScene3D(walls, posts, openings, showSheathing, scaleRatio = 1.0, layers = {}, roofConfig = {}, foundationConfig = {}, joistsConfig = {}) {
    if (!elementsGroup) return;
    
    // Clear previous models
    while (elementsGroup.children.length > 0) {
        const obj = elementsGroup.children[0];
        elementsGroup.remove(obj);
    }

    const LUMBER_T = 38; // Thickness of typical 2x dimensional lumber (38mm)
    const STUD_W = 89;  // Width (depth in wall) for 2x4 (89mm) or 2x6 (140mm) - we use wall thickness

    // 1. Render Foundation (Concrete footer below floor 1)
    if (!layers || layers.foundation !== false) {
        renderFoundation3D(walls, scaleRatio);
    }

    // 2. Render Floor Joists
    if (!layers || layers.joists !== false) {
        renderJoists3D(walls, scaleRatio);
    }

    // 3. Render Posts
    if (!layers || layers.posts !== false) {
        posts.forEach(post => {
            const floorOffset = getFloorOffset(post.floor || '1', walls);
            const postGeo = new THREE.BoxGeometry(post.width, post.height, post.depth);
            const postMesh = new THREE.Mesh(postGeo, woodMaterial);
            postMesh.position.set(post.x * scaleRatio, floorOffset + post.height / 2, post.y * scaleRatio);
            postMesh.castShadow = true;
            postMesh.receiveShadow = true;
            elementsGroup.add(postMesh);
        });
    }

    // 4. Render Walls & Openings
    if (!layers || layers.walls !== false) {
        walls.forEach(wall => {
            const wallThickness = wall.thickness;
            const wallHeight = wall.height;
            const studSpacing = wall.studSpacing;

            // Calculate wall angle and length
            const dx = wall.x2 - wall.x1;
            const dy = wall.y2 - wall.y1;
            const len = Math.sqrt(dx * dx + dy * dy) * scaleRatio;
            const angle = Math.atan2(dy, dx);

            const floorOffset = getFloorOffset(wall.floor || '1', walls);
            
            // Wall Group (local coordinate system: origin at (x1, y1), along x-axis)
            const wallGroup = new THREE.Group();
            wallGroup.position.set(wall.x1 * scaleRatio, floorOffset, wall.y1 * scaleRatio);
            wallGroup.rotation.y = -angle;

            // Find openings on this wall
            const wallOpenings = openings.filter(op => op.wallId === wall.id)
                                         .sort((a, b) => a.distance - b.distance);

            // 3D Geometry Helper
            const createTimberMesh = (w, h, d, px, py, pz) => {
                const geo = new THREE.BoxGeometry(w, h, d);
                const mesh = new THREE.Mesh(geo, woodMaterial);
                mesh.position.set(px, py, pz);
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                wallGroup.add(mesh);
            };

            // --- Render Plates (깔도리) ---
            let bottomPlateSegments = [{ start: 0, end: len }];
            
            // Split bottom plate for doors
            if (!layers || layers.openings !== false) {
                wallOpenings.forEach(op => {
                    if (op.type === 'door') {
                        const opStart = op.distance - op.width / 2;
                        const opEnd = op.distance + op.width / 2;
                        
                        const newSegments = [];
                        bottomPlateSegments.forEach(seg => {
                            if (seg.end <= opStart || seg.start >= opEnd) {
                                newSegments.push(seg);
                            } else {
                                if (seg.start < opStart) {
                                    newSegments.push({ start: seg.start, end: opStart });
                                }
                                if (seg.end > opEnd) {
                                    newSegments.push({ start: opEnd, end: seg.end });
                                }
                            }
                        });
                        bottomPlateSegments = newSegments;
                    }
                });
            }

            // Draw Bottom Plates
            bottomPlateSegments.forEach(seg => {
                const segLen = seg.end - seg.start;
                if (segLen > 1) {
                    createTimberMesh(segLen, LUMBER_T, wallThickness, seg.start + segLen / 2, LUMBER_T / 2, 0);
                }
            });

            // Draw Top Plates (Double plate)
            createTimberMesh(len, LUMBER_T, wallThickness, len / 2, wallHeight - LUMBER_T / 2, 0);
            createTimberMesh(len, LUMBER_T, wallThickness, len / 2, wallHeight - LUMBER_T - LUMBER_T / 2, 0);

            // --- Render Vertical Studs & Openings ---
            let studCoords = [];
            for (let x = 0; x <= len; x += studSpacing) {
                studCoords.push(x);
            }
            if (studCoords[studCoords.length - 1] !== len) {
                studCoords.push(len); // Ensure end stud
            }

            const studH = wallHeight - (LUMBER_T * 3); // Stud height minus top/bottom plates

            // Gather opening ranges to exclude normal studs
            let openingRanges = [];
            if (!layers || layers.openings !== false) {
                openingRanges = wallOpenings.map(op => {
                    const oStart = op.distance - op.width / 2;
                    const oEnd = op.distance + op.width / 2;
                    
                    const headerHeight = 140; // 140mm header beam depth
                    const sillT = LUMBER_T;

                    // 1. Jack Studs (Trimmers)
                    const jackH = op.type === 'door' ? (op.height - LUMBER_T) : (op.height);
                    const jackY = op.type === 'door' ? (LUMBER_T + jackH / 2) : (op.sillHeight + sillT + jackH / 2);
                    
                    createTimberMesh(LUMBER_T, jackH, wallThickness, oStart + LUMBER_T / 2, jackY, 0);
                    createTimberMesh(LUMBER_T, jackH, wallThickness, oEnd - LUMBER_T / 2, jackY, 0);

                    // 2. King Studs
                    const kingY = LUMBER_T + studH / 2;
                    createTimberMesh(LUMBER_T, studH, wallThickness, oStart - LUMBER_T / 2, kingY, 0);
                    createTimberMesh(LUMBER_T, studH, wallThickness, oEnd + LUMBER_T / 2, kingY, 0);

                    // 3. Header
                    const headerW = op.width;
                    const headerY = op.type === 'door' ? 
                        (LUMBER_T + jackH + headerHeight / 2) : 
                        (op.sillHeight + sillT + jackH + headerHeight / 2);
                    createTimberMesh(headerW, headerHeight, wallThickness, op.distance, headerY, 0);

                    // 4. Window Sill
                    if (op.type === 'window') {
                        createTimberMesh(op.width, sillT, wallThickness, op.distance, op.sillHeight + sillT / 2, 0);
                        
                        // Window Cripple Studs
                        const cHeightUnder = op.sillHeight - LUMBER_T;
                        if (cHeightUnder > 0) {
                            const cY = LUMBER_T + cHeightUnder / 2;
                            for (let cx = oStart + studSpacing - (oStart % studSpacing); cx < oEnd; cx += studSpacing) {
                                createTimberMesh(LUMBER_T, cHeightUnder, wallThickness, cx, cY, 0);
                            }
                        }
                    }

                    // 5. Header Cripple Studs
                    const headerTopY = headerY + headerHeight / 2;
                    const cHeightAbove = (wallHeight - LUMBER_T * 2) - headerTopY;
                    if (cHeightAbove > 0) {
                        const cY = headerTopY + cHeightAbove / 2;
                        for (let cx = oStart; cx <= oEnd; cx += studSpacing) {
                            if (cx >= oStart + LUMBER_T && cx <= oEnd - LUMBER_T) {
                                createTimberMesh(LUMBER_T, cHeightAbove, wallThickness, cx, cY, 0);
                            }
                        }
                    }

                    return { start: oStart - LUMBER_T, end: oEnd + LUMBER_T };
                });
            }

            // Draw normal vertical studs
            const studY = LUMBER_T + studH / 2;
            studCoords.forEach(x => {
                const isInsideOpening = openingRanges.some(r => x > r.start && x < r.end);
                if (!isInsideOpening) {
                    createTimberMesh(LUMBER_T, studH, wallThickness, x, studY, 0);
                }
            });

            // --- Render Wall Sheathing ---
            if (showSheathing) {
                const sheathingMaterialCloned = sheathingMaterial.clone();
                let sheathingSegments = [{ start: 0, end: len }];
                
                if (!layers || layers.openings !== false) {
                    wallOpenings.forEach(op => {
                        const oStart = op.distance - op.width / 2;
                        const oEnd = op.distance + op.width / 2;
                        
                        const newSegs = [];
                        sheathingSegments.forEach(seg => {
                            if (seg.end <= oStart || seg.start >= oEnd) {
                                newSegs.push(seg);
                            } else {
                                if (seg.start < oStart) {
                                    newSegs.push({ start: seg.start, end: oStart });
                                }
                                if (seg.end > oEnd) {
                                    newSegs.push({ start: op.distance + op.width / 2, end: seg.end });
                                }
                            }
                        });
                        sheathingSegments = newSegs;

                        // Panel segment above
                        const topPartH = wallHeight - (op.type === 'door' ? op.height : (op.sillHeight + op.height));
                        const topPartY = wallHeight - topPartH / 2;
                        if (topPartH > 10) {
                            const geoTop = new THREE.BoxGeometry(op.width, topPartH, wallThickness + 2);
                            const meshTop = new THREE.Mesh(geoTop, sheathingMaterialCloned);
                            meshTop.position.set(op.distance, topPartY, 0);
                            wallGroup.add(meshTop);
                        }

                        // Panel segment below (windows only)
                        if (op.type === 'window' && op.sillHeight > 10) {
                            const geoBottom = new THREE.BoxGeometry(op.width, op.sillHeight, wallThickness + 2);
                            const meshBottom = new THREE.Mesh(geoBottom, sheathingMaterialCloned);
                            meshBottom.position.set(op.distance, op.sillHeight / 2, 0);
                            wallGroup.add(meshBottom);
                        }
                    });
                }

                // Draw full height sheathing panels
                sheathingSegments.forEach(seg => {
                    const segLen = seg.end - seg.start;
                    if (segLen > 2) {
                        const geoSeg = new THREE.BoxGeometry(segLen, wallHeight, wallThickness + 2);
                        const meshSeg = new THREE.Mesh(geoSeg, sheathingMaterialCloned);
                        meshSeg.position.set(seg.start + segLen / 2, wallHeight / 2, 0);
                        wallGroup.add(meshSeg);
                    }
                });
            }

            elementsGroup.add(wallGroup);
        });
    }

    // 5. Render Roof (Saddle, Hip, Shed rafters on top of highest walls)
    if (!layers || layers.roof !== false) {
        renderRoof3D(walls, scaleRatio, roofConfig);
    }
}

// Render concrete strip foundation underneath the first floor walls
function renderFoundation3D(walls, scaleRatio) {
    if (!walls || walls.length === 0) return;
    const f1Walls = walls.filter(w => (w.floor || '1') === '1');
    f1Walls.forEach(wall => {
        const dx = wall.x2 - wall.x1;
        const dy = wall.y2 - wall.y1;
        const len = Math.sqrt(dx * dx + dy * dy) * scaleRatio;
        const angle = Math.atan2(dy, dx);
        
        const fWidth = wall.thickness + 100;
        const fDepth = 600;
        
        const fGeo = new THREE.BoxGeometry(len, fDepth, fWidth);
        const fMesh = new THREE.Mesh(fGeo, concreteMaterial);
        
        const midX = (wall.x1 + wall.x2) / 2 * scaleRatio;
        const midY = (wall.y1 + wall.y2) / 2 * scaleRatio;
        fMesh.position.set(midX, -fDepth / 2, midY);
        fMesh.rotation.y = -angle;
        
        fMesh.castShadow = true;
        fMesh.receiveShadow = true;
        elementsGroup.add(fMesh);
    });
}

// Render structural floor joists below bottom plates of each floor
function renderJoists3D(walls, scaleRatio) {
    if (!walls || walls.length === 0) return;
    const floors = ['1', '2', '3'];
    floors.forEach(floor => {
        const floorWalls = walls.filter(w => (w.floor || '1') === floor);
        if (floorWalls.length === 0) return;
        
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        floorWalls.forEach(w => {
            minX = Math.min(minX, w.x1, w.x2);
            maxX = Math.max(maxX, w.x1, w.x2);
            minY = Math.min(minY, w.y1, w.y2);
            maxY = Math.max(maxY, w.y1, w.y2);
        });
        
        if (minX === Infinity) return;
        
        const w = (maxX - minX) * scaleRatio;
        const h = (maxY - minY) * scaleRatio;
        const floorOffset = getFloorOffset(floor, walls);
        
        const joistSpacing = 400; // 16 inches O.C.
        const joistThickness = 38;
        const joistDepth = 235; // 2x10 joist depth
        
        if (w >= h) {
            for (let x = minX * scaleRatio + joistSpacing; x < maxX * scaleRatio; x += joistSpacing) {
                const jGeo = new THREE.BoxGeometry(joistThickness, joistDepth, h);
                const jMesh = new THREE.Mesh(jGeo, woodMaterial);
                jMesh.position.set(x, floorOffset - joistDepth / 2, (minY + maxY) / 2 * scaleRatio);
                jMesh.castShadow = true;
                jMesh.receiveShadow = true;
                elementsGroup.add(jMesh);
            }
        } else {
            for (let y = minY * scaleRatio + joistSpacing; y < maxY * scaleRatio; y += joistSpacing) {
                const jGeo = new THREE.BoxGeometry(w, joistDepth, joistThickness);
                const jMesh = new THREE.Mesh(jGeo, woodMaterial);
                jMesh.position.set((minX + maxX) / 2 * scaleRatio, floorOffset - joistDepth / 2, y);
                jMesh.castShadow = true;
                jMesh.receiveShadow = true;
                elementsGroup.add(jMesh);
            }
        }
    });
}

// Calculate the height level for roof baseline
function getHighestFloorOffset(walls) {
    if (!walls || walls.length === 0) return 0;
    let highestFloor = '1';
    walls.forEach(w => {
        const f = w.floor || '1';
        if (f > highestFloor) highestFloor = f;
    });
    const floorWalls = walls.filter(w => (w.floor || '1') === highestFloor);
    const maxH = Math.max(...floorWalls.map(w => w.height));
    return getFloorOffset(highestFloor, walls) + maxH;
}

// Render structural roof rafters (Gable, Hip, Shed)
function renderRoof3D(walls, scaleRatio, roofConfig = {}) {
    const type = roofConfig.type || 'none';
    if (type === 'none') return;
    
    let highestFloor = '1';
    walls.forEach(w => {
        const f = w.floor || '1';
        if (f > highestFloor) highestFloor = f;
    });
    const topWalls = walls.filter(w => (w.floor || '1') === highestFloor);
    if (topWalls.length === 0) return;
    
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    topWalls.forEach(w => {
        minX = Math.min(minX, w.x1, w.x2);
        maxX = Math.max(maxX, w.x1, w.x2);
        minY = Math.min(minY, w.y1, w.y2);
        maxY = Math.max(maxY, w.y1, w.y2);
    });
    
    const overhang = parseFloat(roofConfig.overhang || 600);
    const pitchVal = parseFloat(roofConfig.pitch || 6);
    const angle = Math.atan(pitchVal / 12);
    
    const roofBaseY = getHighestFloorOffset(walls);
    
    const xSpan = (maxX - minX) * scaleRatio;
    const ySpan = (maxY - minY) * scaleRatio;
    
    const rafterSpacing = parseFloat(roofConfig.rafterSpacing || 400);
    const rafterThickness = 38;
    const rafterDepth = 184; // 2x8 lumber
    
    const isRidgeAlongX = xSpan >= ySpan;
    
    if (type === 'gable') {
        if (isRidgeAlongX) {
            const ridgeX1 = minX * scaleRatio - overhang;
            const ridgeX2 = maxX * scaleRatio + overhang;
            const ridgeY = (minY + maxY) / 2 * scaleRatio;
            const halfYSpan = ySpan / 2 + overhang;
            const ridgeHeight = halfYSpan * Math.tan(angle);
            
            const ridgeBeamGeo = new THREE.BoxGeometry(ridgeX2 - ridgeX1, 235, 38);
            const ridgeBeam = new THREE.Mesh(ridgeBeamGeo, woodMaterial);
            ridgeBeam.position.set((ridgeX1 + ridgeX2) / 2, roofBaseY + ridgeHeight - 117, ridgeY);
            ridgeBeam.castShadow = true;
            elementsGroup.add(ridgeBeam);
            
            const rafterLength = halfYSpan / Math.cos(angle);
            for (let x = ridgeX1; x <= ridgeX2; x += rafterSpacing) {
                const leftRafter = new THREE.Mesh(new THREE.BoxGeometry(rafterThickness, rafterDepth, rafterLength), woodMaterial);
                leftRafter.position.set(x, roofBaseY + ridgeHeight / 2, ridgeY - halfYSpan / 2);
                leftRafter.rotation.x = -angle;
                leftRafter.castShadow = true;
                elementsGroup.add(leftRafter);
                
                const rightRafter = new THREE.Mesh(new THREE.BoxGeometry(rafterThickness, rafterDepth, rafterLength), woodMaterial);
                rightRafter.position.set(x, roofBaseY + ridgeHeight / 2, ridgeY + halfYSpan / 2);
                rightRafter.rotation.x = angle;
                rightRafter.castShadow = true;
                elementsGroup.add(rightRafter);
            }
        } else {
            const ridgeY1 = minY * scaleRatio - overhang;
            const ridgeY2 = maxY * scaleRatio + overhang;
            const ridgeX = (minX + maxX) / 2 * scaleRatio;
            const halfXSpan = xSpan / 2 + overhang;
            const ridgeHeight = halfXSpan * Math.tan(angle);
            
            const ridgeBeamGeo = new THREE.BoxGeometry(38, 235, ridgeY2 - ridgeY1);
            const ridgeBeam = new THREE.Mesh(ridgeBeamGeo, woodMaterial);
            ridgeBeam.position.set(ridgeX, roofBaseY + ridgeHeight - 117, (ridgeY1 + ridgeY2) / 2);
            ridgeBeam.castShadow = true;
            elementsGroup.add(ridgeBeam);
            
            const rafterLength = halfXSpan / Math.cos(angle);
            for (let y = ridgeY1; y <= ridgeY2; y += rafterSpacing) {
                const leftRafter = new THREE.Mesh(new THREE.BoxGeometry(rafterLength, rafterDepth, rafterThickness), woodMaterial);
                leftRafter.position.set(ridgeX - halfXSpan / 2, roofBaseY + ridgeHeight / 2, y);
                leftRafter.rotation.z = angle;
                leftRafter.castShadow = true;
                elementsGroup.add(leftRafter);
                
                const rightRafter = new THREE.Mesh(new THREE.BoxGeometry(rafterLength, rafterDepth, rafterThickness), woodMaterial);
                rightRafter.position.set(ridgeX + halfXSpan / 2, roofBaseY + ridgeHeight / 2, y);
                rightRafter.rotation.z = -angle;
                rightRafter.castShadow = true;
                elementsGroup.add(rightRafter);
            }
        }
    } else if (type === 'shed') {
        if (isRidgeAlongX) {
            const spanX = maxX * scaleRatio + overhang - (minX * scaleRatio - overhang);
            const spanY = ySpan + overhang * 2;
            const ridgeHeight = spanY * Math.tan(angle);
            const rafterLength = spanY / Math.cos(angle);
            
            for (let x = minX * scaleRatio - overhang; x <= maxX * scaleRatio + overhang; x += rafterSpacing) {
                const rafter = new THREE.Mesh(new THREE.BoxGeometry(rafterThickness, rafterDepth, rafterLength), woodMaterial);
                rafter.position.set(x, roofBaseY + ridgeHeight / 2, (minY + maxY) / 2 * scaleRatio);
                rafter.rotation.x = angle;
                rafter.castShadow = true;
                elementsGroup.add(rafter);
            }
        } else {
            const spanX = xSpan + overhang * 2;
            const spanY = maxY * scaleRatio + overhang - (minY * scaleRatio - overhang);
            const ridgeHeight = spanX * Math.tan(angle);
            const rafterLength = spanX / Math.cos(angle);
            
            for (let y = minY * scaleRatio - overhang; y <= maxY * scaleRatio + overhang; y += rafterSpacing) {
                const rafter = new THREE.Mesh(new THREE.BoxGeometry(rafterLength, rafterDepth, rafterThickness), woodMaterial);
                rafter.position.set((minX + maxX) / 2 * scaleRatio, roofBaseY + ridgeHeight / 2, y);
                rafter.rotation.z = angle;
                rafter.castShadow = true;
                elementsGroup.add(rafter);
            }
        }
    } else if (type === 'hip') {
        if (isRidgeAlongX) {
            const ridgeX1 = minX * scaleRatio + ySpan / 2;
            const ridgeX2 = maxX * scaleRatio - ySpan / 2;
            const ridgeY = (minY + maxY) / 2 * scaleRatio;
            const halfYSpan = ySpan / 2 + overhang;
            const ridgeHeight = halfYSpan * Math.tan(angle);
            
            if (ridgeX2 > ridgeX1) {
                const ridgeBeamGeo = new THREE.BoxGeometry(ridgeX2 - ridgeX1, 235, 38);
                const ridgeBeam = new THREE.Mesh(ridgeBeamGeo, woodMaterial);
                ridgeBeam.position.set((ridgeX1 + ridgeX2) / 2, roofBaseY + ridgeHeight - 117, ridgeY);
                ridgeBeam.castShadow = true;
                elementsGroup.add(ridgeBeam);
            }
            
            const corners = [
                { x: minX * scaleRatio - overhang, y: minY * scaleRatio - overhang },
                { x: maxX * scaleRatio + overhang, y: minY * scaleRatio - overhang },
                { x: maxX * scaleRatio + overhang, y: maxY * scaleRatio + overhang },
                { x: minX * scaleRatio - overhang, y: maxY * scaleRatio + overhang }
            ];
            const ridgePts = [
                { x: Math.max(ridgeX1, (minX + maxX)/2 * scaleRatio), y: ridgeY },
                { x: Math.min(ridgeX2, (minX + maxX)/2 * scaleRatio), y: ridgeY }
            ];
            
            corners.forEach((c, idx) => {
                const rp = (c.x < (minX + maxX)/2 * scaleRatio) ? ridgePts[0] : ridgePts[1];
                const dx = rp.x - c.x;
                const dy = rp.y - c.y;
                const hLen = Math.sqrt(dx * dx + dy * dy);
                const hipLength = Math.sqrt(hLen * hLen + ridgeHeight * ridgeHeight);
                const hipAngleY = Math.atan2(dy, dx);
                const hipAnglePitch = Math.atan(ridgeHeight / hLen);
                
                const hipRafter = new THREE.Mesh(new THREE.BoxGeometry(hipLength, rafterDepth + 20, rafterThickness + 10), woodMaterial);
                hipRafter.position.set((c.x + rp.x) / 2, roofBaseY + ridgeHeight / 2, (c.y + rp.y) / 2);
                hipRafter.rotation.y = -hipAngleY;
                hipRafter.rotation.z = (c.x < rp.x) ? hipAnglePitch : -hipAnglePitch;
                hipRafter.castShadow = true;
                elementsGroup.add(hipRafter);
            });
            
            const startX = minX * scaleRatio - overhang;
            const endX = maxX * scaleRatio + overhang;
            const rafterLength = halfYSpan / Math.cos(angle);
            
            for (let x = startX; x <= endX; x += rafterSpacing) {
                if (x >= ridgePts[0].x && x <= ridgePts[1].x) {
                    const leftRafter = new THREE.Mesh(new THREE.BoxGeometry(rafterThickness, rafterDepth, rafterLength), woodMaterial);
                    leftRafter.position.set(x, roofBaseY + ridgeHeight / 2, ridgeY - halfYSpan / 2);
                    leftRafter.rotation.x = angle;
                    leftRafter.castShadow = true;
                    elementsGroup.add(leftRafter);
                    
                    const rightRafter = new THREE.Mesh(new THREE.BoxGeometry(rafterThickness, rafterDepth, rafterLength), woodMaterial);
                    rightRafter.position.set(x, roofBaseY + ridgeHeight / 2, ridgeY + halfYSpan / 2);
                    rightRafter.rotation.x = -angle;
                    rightRafter.castShadow = true;
                    elementsGroup.add(rightRafter);
                }
            }
        }
    }
}

// Orbit preset camera positions helper
function set3DViewPreset(preset) {
    if (!camera || !controls) return;
    
    // Default target center
    controls.target.set(0, 0, 0);
    
    switch (preset) {
        case 'iso':
            camera.position.set(4000, 3000, 5000);
            break;
        case 'top':
            camera.position.set(0, 8000, 0);
            break;
        case 'front':
            camera.position.set(0, 1000, 7000);
            break;
        case 'side':
            camera.position.set(7000, 1000, 0);
            break;
    }
    
    controls.update();
}

// Export 3D Scene to GLTF/GLB format for SketchUp, Blender, etc.
function exportGLTF(filename = 'TimberHouse_3D_Model.glb') {
    if (!elementsGroup) {
        alert('내보낼 3D 요소가 없습니다.');
        return;
    }

    if (typeof THREE.GLTFExporter === 'undefined') {
        alert('GLTFExporter 라이브러리가 로드되지 않았습니다.');
        return;
    }

    const exporter = new THREE.GLTFExporter();
    const options = {
        binary: true,
        onlyVisible: true
    };

    exporter.parse(
        elementsGroup.children.length > 0 ? elementsGroup : scene,
        function (glbBuffer) {
            const blob = new Blob([glbBuffer], { type: 'application/octet-stream' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = filename;
            link.click();
            URL.revokeObjectURL(link.href);
            console.log('[TimberDesigner] GLB export completed:', filename);
        },
        function (error) {
            console.error('[TimberDesigner] GLB export failed:', error);
            alert('3D 내보내기 중 오류가 발생했습니다: ' + error);
        },
        options
    );
}

// 3D Raycasting Object Selection
let selected3DObject = null;
let highlightBoxHelper = null;

function raycast3DObject(event, containerId = 'canvas3d-container') {
    if (!renderer || !camera || !elementsGroup) return null;

    const container = document.getElementById(containerId);
    if (!container) return null;

    const rect = renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);

    const intersects = raycaster.intersectObjects(elementsGroup.children, true);
    if (intersects.length > 0) {
        const hitObject = intersects[0].object;
        highlight3DObject(hitObject);
        return hitObject;
    } else {
        clear3DSelection();
        return null;
    }
}

function highlight3DObject(obj) {
    clear3DSelection();
    if (!obj || !scene) return;

    selected3DObject = obj;
    highlightBoxHelper = new THREE.BoxHelper(obj, 0x10b981);
    scene.add(highlightBoxHelper);
}

function clear3DSelection() {
    if (highlightBoxHelper && scene) {
        scene.remove(highlightBoxHelper);
        if (typeof highlightBoxHelper.dispose === 'function') {
            highlightBoxHelper.dispose();
        }
        highlightBoxHelper = null;
    }
    selected3DObject = null;
}

// Graphic Quality Toggle (Low vs High PBR)
let currentGraphicQuality = 'high';

function setGraphicQuality(quality = 'high') {
    currentGraphicQuality = quality;
    if (!renderer || !woodMaterial) return;

    if (quality === 'low') {
        renderer.shadowMap.enabled = false;
        woodMaterial.roughness = 0.9;
        woodMaterial.metalness = 0.0;
        console.log('[TimberDesigner] Graphic Quality set to LOW (Fast 60 FPS)');
    } else {
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        woodMaterial.roughness = 0.65;
        woodMaterial.metalness = 0.15;
        console.log('[TimberDesigner] Graphic Quality set to HIGH (PBR + Shadows)');
    }
}

// Sun Position & Time of Day Controller
function setSunPosition(timeOfDay = '12') {
    if (!scene) return;
    const dirLight = scene.children.find(c => c.isDirectionalLight);
    if (!dirLight) return;

    switch (String(timeOfDay)) {
        case '8': // Morning 8 AM
            dirLight.position.set(-8000, 4000, 7500);
            dirLight.intensity = 0.7;
            dirLight.color.setHex(0xfffaed);
            break;
        case '12': // Noon 12 PM
            dirLight.position.set(2000, 12000, 4000);
            dirLight.intensity = 0.95;
            dirLight.color.setHex(0xffffff);
            break;
        case '16': // Afternoon 4 PM
            dirLight.position.set(7000, 5000, 5000);
            dirLight.intensity = 0.8;
            dirLight.color.setHex(0xfff3db);
            break;
        case '18': // Sunset 6 PM
            dirLight.position.set(9000, 1500, 2000);
            dirLight.intensity = 0.6;
            dirLight.color.setHex(0xff9e64);
            break;
    }
}





