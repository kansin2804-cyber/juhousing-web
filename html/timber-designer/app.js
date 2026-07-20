// ============================================================
// Timber House Designer v2.0 — App Logic
// Features: Undo/Redo, Endpoint/Angle Snap, VCB Input,
//           Drag Move/Resize, Copy/Paste, Multi-Select,
//           Project Save/Load, Guidelines, Always-on Dimensions,
//           Floor management, Room area auto-recognition, Mirror, Offset
// ============================================================

// State Management
const state = {
    // Canvas & Views
    scaleRatio: 1.0,
    scaleSet: false,
    zoomScale: 1.0,
    panX: 0,
    panY: 0,
    isPanning: false,
    panStart: { x: 0, y: 0 },

    // Grid settings
    gridSnap: true,
    gridSizeMm: 100,
    endpointSnap: true,
    showDimensions: true,
    activeFloor: '1',

    // Tools
    activeTool: 'select',
    activeElement: null,

    // Blueprint Background
    bgImage: null,
    bgWidth: 2000,
    bgHeight: 1500,

    // Database of elements
    walls: [],     // { id, x1, y1, x2, y2, thickness, height, studSpacing, floor }
    posts: [],     // { id, x, y, width, depth, height, floor }
    openings: [],  // { id, wallId, distance, width, height, sillHeight, type }
    guides: [],    // { id, type:'h'|'v', pos: px, floor }
    rooms: [],     // { id, name, areaM2, pyeong, center: {x,y}, pts: [{x,y}] }
    roomLabels: [], // VLM name hints { name, x, y, floor } — matched in calculateRooms
    annotations: [], // { id, x1, y1, x2, y2, text, floor }

    // Phase 3 Configurations
    roofConfig: {
        type: 'gable', // gable, hip, shed, none
        pitch: 6,
        overhang: 600,
        rafterSpacing: 400
    },
    foundation: {
        type: 'strip',
        depth: 600,
        width: 400
    },
    joistConfig: {
        direction: 'auto',
        spacing: 400,
        depth: 235
    },
    layers: {
        walls: true,
        posts: true,
        openings: true,
        roof: true,
        foundation: true,
        joists: true,
        guides: true,
        annotations: true
    },
    unitPrices: {
        stud: 8500,      // Per stud (2x6)
        plate: 4000,     // Per meter
        post: 25000,     // Per post
        rafter: 15000,   // Per rafter
        concrete: 95000  // Per m3
    },

    // Multi-selection
    selectedElements: [], // [{type, data}]

    // Interaction states
    drawingWall: false,
    wallStart: null,
    drawingScale: false,
    scaleStart: null,
    scaleEnd: null,
    hoveredWall: null,
    shiftHeld: false,

    // Drag Move state
    isDragging: false,
    dragTarget: null,   // {type, data, startMouse, origPositions}
    dragStartMouse: null,

    // Resize Handle state
    isResizing: false,
    resizeTarget: null, // {wall, endpoint: 'start'|'end', startMouse}

    // Offset state
    offsetDistancePx: 0,
    offsetDistanceMm: 0,

    // VCB (Value Control Box) state
    vcbValue: '',
    vcbActive: false,

    // Guide drawing
    drawingGuide: false,
    guideType: null,

    // Undo/Redo
    undoStack: [],
    redoStack: [],
    maxUndoDepth: 50,

    // Copy buffer
    clipboard: null
};

// Canvas references
let canvas, ctx;
let nextId = 1;

// ============================================================
// INITIALIZATION
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    initUI();
    initCanvas();
    init3D('threejs-viewport');
    syncThemeIcon();
    updateStatus('도면 파일을 업로드하거나, 벽체 도구를 선택하여 그리기를 시작해 보세요.');
    calculateRooms();
});

// ============================================================
// UNDO / REDO SYSTEM
// ============================================================
function saveSnapshot() {
    const snapshot = {
        walls: JSON.parse(JSON.stringify(state.walls)),
        posts: JSON.parse(JSON.stringify(state.posts)),
        openings: JSON.parse(JSON.stringify(state.openings)),
        guides: JSON.parse(JSON.stringify(state.guides)),
        rooms: JSON.parse(JSON.stringify(state.rooms)),
        activeFloor: state.activeFloor,
        nextId: nextId
    };
    state.undoStack.push(snapshot);
    if (state.undoStack.length > state.maxUndoDepth) {
        state.undoStack.shift();
    }
    state.redoStack = [];
    updateUndoRedoButtons();
}

function undo() {
    if (state.undoStack.length === 0) return;
    const current = {
        walls: JSON.parse(JSON.stringify(state.walls)),
        posts: JSON.parse(JSON.stringify(state.posts)),
        openings: JSON.parse(JSON.stringify(state.openings)),
        guides: JSON.parse(JSON.stringify(state.guides)),
        rooms: JSON.parse(JSON.stringify(state.rooms)),
        activeFloor: state.activeFloor,
        nextId: nextId
    };
    state.redoStack.push(current);

    const snapshot = state.undoStack.pop();
    state.walls = snapshot.walls;
    state.posts = snapshot.posts;
    state.openings = snapshot.openings;
    state.guides = snapshot.guides;
    state.rooms = snapshot.rooms;
    state.activeFloor = snapshot.activeFloor;
    nextId = snapshot.nextId;

    // Update floor selector value to match
    const floorSelect = document.getElementById('floor-select');
    if (floorSelect) floorSelect.value = state.activeFloor;

    selectElement(null);
    state.selectedElements = [];
    updateMultiSelectUI();
    syncTo3D();
    updateMaterialTakeoff();
    calculateRooms();
    draw2D();
    updateUndoRedoButtons();
    updateStatus('실행 취소되었습니다.');
}

function redo() {
    if (state.redoStack.length === 0) return;
    const current = {
        walls: JSON.parse(JSON.stringify(state.walls)),
        posts: JSON.parse(JSON.stringify(state.posts)),
        openings: JSON.parse(JSON.stringify(state.openings)),
        guides: JSON.parse(JSON.stringify(state.guides)),
        rooms: JSON.parse(JSON.stringify(state.rooms)),
        activeFloor: state.activeFloor,
        nextId: nextId
    };
    state.undoStack.push(current);

    const snapshot = state.redoStack.pop();
    state.walls = snapshot.walls;
    state.posts = snapshot.posts;
    state.openings = snapshot.openings;
    state.guides = snapshot.guides;
    state.rooms = snapshot.rooms;
    state.activeFloor = snapshot.activeFloor;
    nextId = snapshot.nextId;

    // Update floor selector value to match
    const floorSelect = document.getElementById('floor-select');
    if (floorSelect) floorSelect.value = state.activeFloor;

    selectElement(null);
    state.selectedElements = [];
    updateMultiSelectUI();
    syncTo3D();
    updateMaterialTakeoff();
    calculateRooms();
    draw2D();
    updateUndoRedoButtons();
    updateStatus('다시 실행되었습니다.');
}

function updateUndoRedoButtons() {
    const btnUndo = document.getElementById('btn-undo');
    const btnRedo = document.getElementById('btn-redo');
    if (btnUndo) btnUndo.disabled = state.undoStack.length === 0;
    if (btnRedo) btnRedo.disabled = state.redoStack.length === 0;
}

// ============================================================
// SNAP SYSTEMS
// ============================================================

// Endpoint Snap — snaps to nearest existing wall endpoint on active floor
function snapToEndpoint(coord, threshold) {
    if (!state.endpointSnap) return null;
    const t = threshold || 15;
    let closest = null;
    let closestDist = Infinity;

    const endpoints = [];
    state.walls.filter(w => (w.floor || '1') === state.activeFloor).forEach(w => {
        endpoints.push({ x: w.x1, y: w.y1 });
        endpoints.push({ x: w.x2, y: w.y2 });
    });
    state.posts.filter(p => (p.floor || '1') === state.activeFloor).forEach(p => {
        endpoints.push({ x: p.x, y: p.y });
    });

    endpoints.forEach(ep => {
        const d = distance(coord, ep);
        if (d < t && d < closestDist) {
            closestDist = d;
            closest = { x: ep.x, y: ep.y };
        }
    });

    return closest;
}

// Angle Snap — constrains to 0/45/90/135/180... angles when Shift is held
function constrainAngle(startPt, endPt) {
    if (!state.shiftHeld) return endPt;

    const dx = endPt.x - startPt.x;
    const dy = endPt.y - startPt.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1) return endPt;

    const angle = Math.atan2(dy, dx);
    const snapAngles = [0, Math.PI / 4, Math.PI / 2, 3 * Math.PI / 4, Math.PI,
                        -Math.PI / 4, -Math.PI / 2, -3 * Math.PI / 4];

    let closestAngle = 0;
    let minDiff = Infinity;
    snapAngles.forEach(sa => {
        let diff = Math.abs(angle - sa);
        if (diff > Math.PI) diff = 2 * Math.PI - diff;
        if (diff < minDiff) {
            minDiff = diff;
            closestAngle = sa;
        }
    });

    return {
        x: startPt.x + dist * Math.cos(closestAngle),
        y: startPt.y + dist * Math.sin(closestAngle)
    };
}

// Combined snap pipeline: Grid → Endpoint → Angle
function applyAllSnaps(coord, refPoint) {
    let result = snapToGrid(coord);

    const epSnap = snapToEndpoint(result);
    if (epSnap) {
        result = epSnap;
        result._snappedEndpoint = true;
    }

    if (refPoint) {
        result = constrainAngle(refPoint, result);
    }

    return result;
}

// ============================================================
// UI INITIALIZATION
// ============================================================
function initUI() {
    // Split Screen Resizing
    const handle = document.getElementById('split-handle');
    const panel2d = document.getElementById('panel-2d');
    const panel3d = document.getElementById('panel-3d');
    let isResizing = false;

    handle.addEventListener('mousedown', (e) => {
        isResizing = true;
        document.body.style.cursor = 'col-resize';
        document.addEventListener('mousemove', handleResize);
        document.addEventListener('mouseup', () => {
            isResizing = false;
            document.body.style.cursor = 'default';
            document.removeEventListener('mousemove', handleResize);
        });
    });

    function handleResize(e) {
        if (!isResizing) return;
        const container = document.querySelector('.main-editor');
        const rect = container.getBoundingClientRect();
        const offsetLeft = e.clientX - rect.left;
        const pct = (offsetLeft / rect.width) * 100;

        if (pct > 20 && pct < 80) {
            panel2d.style.flex = `0 0 ${pct}%`;
            panel3d.style.flex = `0 0 ${100 - pct}%`;
            refreshThreeJSSize();
        }
    }

    // Drawing Tool Selector Buttons
    const toolButtons = document.querySelectorAll('.tool-btn');
    toolButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            toolButtons.forEach(b => b.classList.remove('active'));

            const tool = btn.getAttribute('data-tool');
            if (tool === 'delete') {
                deleteSelectedElements();
                document.getElementById('tool-select').classList.add('active');
                setTool('select');
            } else {
                btn.classList.add('active');
                setTool(tool);
            }
        });
    });

    // Floor Selector Trigger
    const floorSelect = document.getElementById('floor-select');
    if (floorSelect) {
        floorSelect.addEventListener('change', (e) => {
            state.activeFloor = e.target.value;
            selectElement(null);
            state.selectedElements = [];
            updateMultiSelectUI();
            draw2D();
            syncTo3D();
            updateMaterialTakeoff();
            calculateRooms();
            updateStatus(`${state.activeFloor}층 편집 모드로 전환되었습니다.`);
        });
    }

    // Mirror Buttons Trigger
    const btnMirrorX = document.getElementById('btn-mirror-x');
    const btnMirrorY = document.getElementById('btn-mirror-y');
    if (btnMirrorX) btnMirrorX.addEventListener('click', () => mirrorSelected('x'));
    if (btnMirrorY) btnMirrorY.addEventListener('click', () => mirrorSelected('y'));

    // File Upload Handler
    document.getElementById('blueprint-upload').addEventListener('change', handleFileUpload);

    // Scale Button
    document.getElementById('btn-set-scale').addEventListener('click', () => {
        setTool('scale');
        toolButtons.forEach(b => b.classList.remove('active'));
        updateStatus('척도를 설정할 도면 위의 시작점과 끝점을 각각 마우스로 클릭해 주세요.');
    });

    // Theme Toggle
    document.getElementById('btn-theme-toggle').addEventListener('click', toggleTheme);

    // Fullscreen Toggle
    const btnFullscreen = document.getElementById('btn-fullscreen-toggle');
    if (btnFullscreen) {
        btnFullscreen.addEventListener('click', () => {
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen().catch(err => {
                    console.error("Error entering fullscreen mode:", err);
                });
            } else {
                document.exitFullscreen();
            }
        });
    }

    // 3D View Preset HUD Binding
    const presets = ['iso', 'top', 'front', 'side'];
    presets.forEach(p => {
        const btn = document.getElementById(`btn-view-${p}`);
        if (btn) {
            btn.addEventListener('click', () => {
                presets.forEach(other => {
                    const oBtn = document.getElementById(`btn-view-${other}`);
                    if (oBtn) oBtn.classList.remove('active');
                });
                btn.classList.add('active');
                set3DViewPreset(p);
            });
        }
    });


    // Reset/Clear
    document.getElementById('btn-clear').addEventListener('click', clearProject);

    // Undo / Redo buttons
    document.getElementById('btn-undo').addEventListener('click', undo);
    document.getElementById('btn-redo').addEventListener('click', redo);

    // Export Dropdown menu
    const btnExportMenu = document.getElementById('btn-export-menu');
    const exportDropdown = document.getElementById('export-dropdown');
    btnExportMenu.addEventListener('click', (e) => {
        exportDropdown.classList.toggle('show');
        e.stopPropagation();
    });
    document.addEventListener('click', () => {
        exportDropdown.classList.remove('show');
    });

    // Export Actions
    document.getElementById('btn-export-img').addEventListener('click', exportImages);
    document.getElementById('btn-export-dxf').addEventListener('click', exportToDXF);
    document.getElementById('btn-export-obj').addEventListener('click', exportToOBJ);

    // Auto Trace
    document.getElementById('btn-auto-trace').addEventListener('click', autoTraceBlueprint);

    // AI Room / Opening labelling (Phase 3 — VLM)
    const btnAiRooms = document.getElementById('btn-ai-rooms');
    if (btnAiRooms) btnAiRooms.addEventListener('click', analyzeRoomsOpenings);

    // Project Save / Load
    document.getElementById('btn-save-project').addEventListener('click', saveProject);
    document.getElementById('load-project-input').addEventListener('change', loadProject);

    // View Mode Focus Buttons
    const viewButtons = {
        split: document.getElementById('btn-view-split'),
        v2d: document.getElementById('btn-view-2d'),
        v3d: document.getElementById('btn-view-3d')
    };

    const setViewMode = (mode) => {
        const editor = document.querySelector('.main-editor');
        editor.classList.remove('view-mode-2d', 'view-mode-3d');

        Object.values(viewButtons).forEach(btn => btn.classList.remove('active'));

        if (mode === '2d') {
            editor.classList.add('view-mode-2d');
            viewButtons.v2d.classList.add('active');
        } else if (mode === '3d') {
            editor.classList.add('view-mode-3d');
            viewButtons.v3d.classList.add('active');
        } else {
            viewButtons.split.classList.add('active');
        }

        setTimeout(() => refreshThreeJSSize(), 100);
    };

    viewButtons.split.addEventListener('click', () => setViewMode('split'));
    viewButtons.v2d.addEventListener('click', () => setViewMode('2d'));
    viewButtons.v3d.addEventListener('click', () => setViewMode('3d'));

    // UI Layout Preset Toggle (SketchUp layout)
    const btnUIToggle = document.getElementById('btn-ui-toggle');
    btnUIToggle.addEventListener('click', () => {
        document.body.classList.toggle('sketchup-layout');
        btnUIToggle.classList.toggle('active');
        updateStatus(document.body.classList.contains('sketchup-layout') ? '스케치업 스타일 UI 모드가 활성화되었습니다.' : '기본 레이아웃 모드로 전환되었습니다.');
        setTimeout(() => refreshThreeJSSize(), 100);
    });

    // Collapsible Sidebar Toggles
    const btnCollapseLeft = document.getElementById('btn-collapse-left');
    const sidebarLeft = document.getElementById('sidebar-left');
    btnCollapseLeft.addEventListener('click', () => {
        sidebarLeft.classList.toggle('collapsed');
        btnCollapseLeft.textContent = sidebarLeft.classList.contains('collapsed') ? '▶' : '◀';
        setTimeout(() => refreshThreeJSSize(), 310);
    });

    const btnCollapseRight = document.getElementById('btn-collapse-right');
    const sidebarRight = document.getElementById('sidebar-right');
    btnCollapseRight.addEventListener('click', () => {
        sidebarRight.classList.toggle('collapsed');
        btnCollapseRight.textContent = sidebarRight.classList.contains('collapsed') ? '◀' : '▶';
        setTimeout(() => refreshThreeJSSize(), 310);
    });

    // Grid & Snap Options
    document.getElementById('chk-grid-snap').addEventListener('change', (e) => {
        state.gridSnap = e.target.checked;
    });
    document.getElementById('chk-endpoint-snap').addEventListener('change', (e) => {
        state.endpointSnap = e.target.checked;
    });
    document.getElementById('chk-show-dimensions').addEventListener('change', (e) => {
        state.showDimensions = e.target.checked;
        draw2D();
    });
    document.getElementById('select-grid-size').addEventListener('change', (e) => {
        state.gridSizeMm = parseInt(e.target.value);
    });

    // Scale Dialog Actions
    document.getElementById('btn-scale-cancel').addEventListener('click', () => {
        document.getElementById('scale-modal').style.display = 'none';
        setTool('select');
        document.getElementById('tool-select').classList.add('active');
    });

    document.getElementById('btn-scale-save').addEventListener('click', () => {
        const inputReal = document.getElementById('input-scale-real');
        const realMm = parseFloat(inputReal.value);
        if (realMm > 0 && state.scaleStart && state.scaleEnd) {
            const dx = state.scaleEnd.x - state.scaleStart.x;
            const dy = state.scaleEnd.y - state.scaleStart.y;
            const pixelDist = Math.sqrt(dx * dx + dy * dy);

            state.scaleRatio = realMm / pixelDist;
            state.scaleSet = true;

            document.getElementById('scale-status').textContent = `척도: 1px = ${state.scaleRatio.toFixed(2)}mm`;
            document.getElementById('scale-status').classList.add('active');
            updateStatus(`척도가 설정되었습니다: 1px = ${state.scaleRatio.toFixed(2)}mm`);

            document.getElementById('scale-modal').style.display = 'none';
            setTool('select');
            document.getElementById('tool-select').classList.add('active');

            syncTo3D();
            draw2D();
        }
    });

    // Properties Inputs Real-time Binding
    const setupInputListeners = (id, propName, objType) => {
        const input = document.getElementById(id);
        if (!input) return;
        input.addEventListener('change', () => {
            if (state.activeElement && state.activeElement.type === objType) {
                saveSnapshot();
                let val = parseFloat(input.value);
                if (input.type === 'checkbox') val = input.checked;
                state.activeElement.data[propName] = val;

                if (objType === 'wall') {
                    const wall = state.walls.find(w => w.id === state.activeElement.data.id);
                    if (wall) wall[propName] = val;
                } else if (objType === 'post') {
                    const post = state.posts.find(p => p.id === state.activeElement.data.id);
                    if (post) post[propName] = val;
                } else if (objType === 'opening') {
                    const op = state.openings.find(o => o.id === state.activeElement.data.id);
                    if (op) {
                        op[propName] = val;
                        if (propName === 'type') {
                            document.getElementById('opening-sill-group').style.display = val === 'window' ? 'block' : 'none';
                        }
                    }
                }

                syncTo3D();
                draw2D();
                updateMaterialTakeoff();
                calculateRooms();
            }
        });
    };

    setupInputListeners('wall-thickness', 'thickness', 'wall');
    setupInputListeners('wall-height', 'height', 'wall');
    setupInputListeners('stud-spacing', 'studSpacing', 'wall');
    setupInputListeners('post-width', 'width', 'post');
    setupInputListeners('post-depth', 'depth', 'post');
    setupInputListeners('post-height', 'height', 'post');
    setupInputListeners('opening-type', 'type', 'opening');
    setupInputListeners('opening-width', 'width', 'opening');
    setupInputListeners('opening-height', 'height', 'opening');
    setupInputListeners('opening-sill-height', 'sillHeight', 'opening');

    // Show transparent sheathing toggle in 3D
    document.getElementById('chk-show-sheathing').addEventListener('change', () => {
        syncTo3D();
    });

    // Phase 3: Roof System and PDF Report Event Listeners
    const btnGenerateRoof = document.getElementById('btn-generate-roof');
    if (btnGenerateRoof) {
        btnGenerateRoof.addEventListener('click', generateRoofFromWalls);
    }

    const btnExportPDF = document.getElementById('btn-export-pdf');
    if (btnExportPDF) {
        btnExportPDF.addEventListener('click', generatePDFReport);
    }

    const btnExportGLB = document.getElementById('btn-export-glb');
    if (btnExportGLB) {
        btnExportGLB.addEventListener('click', () => {
            if (typeof exportGLTF === 'function') {
                exportGLTF('TimberHouse_3D_Model.glb');
            } else {
                alert('GLTF 내보내기 모듈이 로드되지 않았습니다.');
            }
        });
    }

    const selectQuality = document.getElementById('quality-select');
    if (selectQuality) {
        selectQuality.addEventListener('change', () => {
            if (typeof setGraphicQuality === 'function') {
                setGraphicQuality(selectQuality.value);
            }
        });
    }

    const selectSun = document.getElementById('sun-select');
    if (selectSun) {
        selectSun.addEventListener('change', () => {
            if (typeof setSunPosition === 'function') {
                setSunPosition(selectSun.value);
            }
        });
    }

    const container3D = document.getElementById('canvas3d-container');
    if (container3D) {
        container3D.addEventListener('click', (e) => {
            if (typeof raycast3DObject === 'function') {
                const selected = raycast3DObject(e, 'canvas3d-container');
                if (selected) {
                    const statusMsg = document.getElementById('status-msg');
                    if (statusMsg) {
                        statusMsg.textContent = `3D 부재 선택됨: ${selected.name || 'TimberElement'}`;
                    }
                }
            }
        });
    }

    const btnShowBOM = document.getElementById('btn-show-bom');
    if (btnShowBOM) {
        btnShowBOM.addEventListener('click', showBOMModal);
    }

    const btnBOMClose = document.getElementById('btn-bom-close');
    if (btnBOMClose) {
        btnBOMClose.addEventListener('click', () => {
            document.getElementById('bom-modal').style.display = 'none';
        });
    }

    const btnBOMPrint = document.getElementById('btn-bom-print');
    if (btnBOMPrint) {
        btnBOMPrint.addEventListener('click', () => {
            window.print();
        });
    }

    const layerCheckboxes = document.querySelectorAll('.layer-list input[type="checkbox"]');
    layerCheckboxes.forEach(chk => {
        chk.addEventListener('change', () => {
            const layer = chk.getAttribute('data-layer');
            state.layers[layer] = chk.checked;
            draw2D();
            syncTo3D();
        });
    });

    ['roof-type', 'roof-pitch', 'roof-overhang', 'rafter-spacing'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('change', () => {
                state.roofConfig.type = document.getElementById('roof-type').value;
                state.roofConfig.pitch = parseFloat(document.getElementById('roof-pitch').value);
                state.roofConfig.overhang = parseFloat(document.getElementById('roof-overhang').value);
                state.roofConfig.rafterSpacing = parseFloat(document.getElementById('rafter-spacing').value);
                draw2D();
                syncTo3D();
                updateMaterialTakeoff();
            });
        }
    });

    // Keyboard Shortcuts

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Shift') {
            state.shiftHeld = true;
            draw2D(state._lastMouseCoord ? applyAllSnaps(state._lastMouseCoord, state.wallStart) : null);
        }

        // Undo/Redo/Save/Copy/Paste
        if (e.ctrlKey || e.metaKey) {
            if (e.key === 'z' || e.key === 'Z') {
                e.preventDefault();
                undo();
                return;
            }
            if (e.key === 'y' || e.key === 'Y') {
                e.preventDefault();
                redo();
                return;
            }
            if (e.key === 's' || e.key === 'S') {
                e.preventDefault();
                saveProject();
                return;
            }
            if (e.key === 'c' || e.key === 'C') {
                e.preventDefault();
                copySelection();
                return;
            }
            if (e.key === 'v' || e.key === 'V') {
                e.preventDefault();
                pasteSelection();
                return;
            }
        }

        // Skip inputs
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

        // VCB numeric entries
        if ((state.drawingWall || state.activeTool === 'offset') && (e.key >= '0' && e.key <= '9' || e.key === '.')) {
            state.vcbValue += e.key;
            updateVCBDisplay();
            return;
        }
        if ((state.drawingWall || state.activeTool === 'offset') && e.key === 'Backspace') {
            state.vcbValue = state.vcbValue.slice(0, -1);
            updateVCBDisplay();
            return;
        }
        if ((state.drawingWall || state.activeTool === 'offset') && e.key === 'Enter' && state.vcbValue) {
            applyVCBValue();
            return;
        }

        switch (e.key.toLowerCase()) {
            case 'v':
                activateToolBtn('select');
                break;
            case 'm':
                activateToolBtn('move');
                break;
            case 'w':
                activateToolBtn('wall');
                break;
            case 'p':
                activateToolBtn('post');
                break;
            case 'o':
                activateToolBtn('opening');
                break;
            case 'f':
                activateToolBtn('offset');
                break;
            case 'g':
                activateToolBtn('guide');
                break;
            case 'd':
                activateToolBtn('dimension');
                break;
            case 'escape':

                cancelActiveDrawing();
                break;
            case 'delete':
                deleteSelectedElements();
                break;
        }
    });

    document.addEventListener('keyup', (e) => {
        if (e.key === 'Shift') {
            state.shiftHeld = false;
            draw2D(state._lastMouseCoord ? applyAllSnaps(state._lastMouseCoord, state.wallStart) : null);
        }
    });
}

function refreshThreeJSSize() {
    if (renderer && camera) {
        const viewport = document.getElementById('threejs-viewport');
        if (viewport && viewport.clientWidth > 0 && viewport.clientHeight > 0) {
            camera.aspect = viewport.clientWidth / viewport.clientHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(viewport.clientWidth, viewport.clientHeight);
        }
    }
}

function activateToolBtn(toolName) {
    const btn = document.querySelector(`.tool-btn[data-tool="${toolName}"]`);
    if (btn) btn.click();
}

// Set Active Tool State
function setTool(tool) {
    state.activeTool = tool;
    document.getElementById('canvas-mode-indicator').textContent = getToolLabel(tool);

    // Reset temporary states
    state.drawingWall = false;
    state.wallStart = null;
    state.drawingScale = false;
    state.drawingGuide = false;
    state.isDragging = false;
    state.isResizing = false;
    state.vcbValue = '';
    updateVCBDisplay();

    // Update cursor
    if (tool === 'move') {
        canvas.style.cursor = 'move';
    } else if (tool === 'select') {
        canvas.style.cursor = 'default';
    } else {
        canvas.style.cursor = 'crosshair';
    }

    draw2D();
}

function getToolLabel(tool) {
    switch (tool) {
        case 'select': return '선택 모드';
        case 'move': return '이동 모드';
        case 'wall': return '벽체 그리기';
        case 'post': return '기둥 배치';
        case 'opening': return '창호 배치';
        case 'scale': return '척도 측정';
        case 'guide': return '가이드라인';
        case 'offset': return '벽체 오프셋';
        default: return '대기 모드';
    }
}

// ============================================================
// VCB (VALUE CONTROL BOX)
// ============================================================
function updateVCBDisplay() {
    const input = document.getElementById('vcb-input');
    const container = document.getElementById('vcb-container');
    if (state.vcbValue) {
        input.value = state.vcbValue;
        container.classList.add('active');
    } else {
        input.value = '';
        container.classList.remove('active');
    }
}

function applyVCBValue() {
    const mm = parseFloat(state.vcbValue);
    if (isNaN(mm) || mm <= 0) return;

    if (state.activeTool === 'offset' && state.hoveredWall) {
        saveSnapshot();
        const wall = state.hoveredWall;
        const dx = wall.x2 - wall.x1;
        const dy = wall.y2 - wall.y1;
        const len = Math.sqrt(dx * dx + dy * dy);
        
        const nx = -dy / len;
        const ny = dx / len;
        
        // Direction is based on last mouse cursor side
        const dir = (state.offsetDistancePx || 0) >= 0 ? 1 : -1;
        const offsetPx = (mm / state.scaleRatio) * dir;
        
        const newWall = {
            id: nextId++,
            x1: wall.x1 + nx * offsetPx,
            y1: wall.y1 + ny * offsetPx,
            x2: wall.x2 + nx * offsetPx,
            y2: wall.y2 + ny * offsetPx,
            thickness: wall.thickness,
            height: wall.height,
            studSpacing: wall.studSpacing,
            floor: state.activeFloor
        };
        
        state.walls.push(newWall);
        state.vcbValue = '';
        updateVCBDisplay();
        
        syncTo3D();
        updateMaterialTakeoff();
        calculateRooms();
        draw2D();
        updateStatus(`벽체가 정확히 ${mm}mm 간격으로 평행 복사되었습니다.`);
        return;
    }

    if (state.drawingWall && state.wallStart) {
        const mouseCoord = state._lastMouseCoord || state.wallStart;
        const dx = mouseCoord.x - state.wallStart.x;
        const dy = mouseCoord.y - state.wallStart.y;
        const currentLen = Math.sqrt(dx * dx + dy * dy);
        if (currentLen < 1) return;

        // Normalize direction and set exact length
        const angle = Math.atan2(dy, dx);
        const pxLen = mm / state.scaleRatio;
        const endPt = {
            x: state.wallStart.x + pxLen * Math.cos(angle),
            y: state.wallStart.y + pxLen * Math.sin(angle)
        };

        const thick = parseFloat(document.getElementById('wall-thickness').value);
        const height = parseFloat(document.getElementById('wall-height').value);
        const studSp = parseFloat(document.getElementById('stud-spacing').value);

        saveSnapshot();
        const newWall = {
            id: nextId++,
            x1: state.wallStart.x,
            y1: state.wallStart.y,
            x2: endPt.x,
            y2: endPt.y,
            thickness: thick,
            height: height,
            studSpacing: studSp,
            floor: state.activeFloor
        };

        state.walls.push(newWall);
        state.wallStart = endPt;
        state.vcbValue = '';
        updateVCBDisplay();

        syncTo3D();
        updateMaterialTakeoff();
        calculateRooms();
        draw2D();
        updateStatus(`정확히 ${mm}mm 벽체가 생성되었습니다.`);
    }
}

// ============================================================
// 2D CANVAS INITIALIZATION
// ============================================================
function initCanvas() {
    canvas = document.getElementById('editor-canvas');
    ctx = canvas.getContext('2d');
    resizeCanvas(2000, 1500);

    const viewport = document.getElementById('canvas-viewport');
    state.panX = (viewport.clientWidth - state.bgWidth) / 2;
    state.panY = (viewport.clientHeight - state.bgHeight) / 2;

    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    viewport.addEventListener('wheel', handleWheel, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}

// ============================================================
// COORDINATE HELPERS
// ============================================================
function getCanvasCoord(e) {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX !== undefined ? e.clientX : e.touches[0].clientX;
    const clientY = e.clientY !== undefined ? e.clientY : e.touches[0].clientY;

    const x = (clientX - rect.left) / (rect.width / canvas.width);
    const y = (clientY - rect.top) / (rect.height / canvas.height);
    return { x, y };
}

function toRealMm(coord) {
    return { x: coord.x * state.scaleRatio, y: coord.y * state.scaleRatio };
}

function toCanvasPx(coordMm) {
    return { x: coordMm.x / state.scaleRatio, y: coordMm.y / state.scaleRatio };
}

function snapToGrid(coord) {
    if (!state.gridSnap) return coord;
    const mm = toRealMm(coord);
    const snappedMm = {
        x: Math.round(mm.x / state.gridSizeMm) * state.gridSizeMm,
        y: Math.round(mm.y / state.gridSizeMm) * state.gridSizeMm
    };
    return toCanvasPx(snappedMm);
}

function distance(p1, p2) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    return Math.sqrt(dx * dx + dy * dy);
}

function projectPointOnSegment(p, v, w) {
    const l2 = dist2(v, w);
    if (l2 === 0) return { pt: v, dist: distance(p, v) };
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    const pt = { x: v.x + t * (w.x - v.x), y: v.y + t * (w.y - v.y) };
    return { pt, dist: distance(p, pt), t };
}

function dist2(v, w) { return (v.x - w.x) ** 2 + (v.y - w.y) ** 2; }

// ============================================================
// MOUSE EVENT HANDLERS
// ============================================================
function handleMouseDown(e) {
    const clickCoord = getCanvasCoord(e);

    // Pan view: Middle click or Right click or Shift key (no tool active)
    if (e.button === 1 || e.button === 2) {
        state.isPanning = true;
        state.panStart = { x: e.clientX, y: e.clientY };
        e.preventDefault();
        return;
    }

    if (e.button !== 0) return;

    const snapped = applyAllSnaps(clickCoord, state.wallStart);

    // --- Scale Tool ---
    if (state.activeTool === 'scale') {
        if (!state.drawingScale) {
            state.scaleStart = clickCoord;
            state.drawingScale = true;
            updateStatus('척도 보정을 위한 두 번째 끝점을 클릭해 주세요.');
        } else {
            state.scaleEnd = clickCoord;
            document.getElementById('scale-modal').style.display = 'flex';
            document.getElementById('input-scale-real').focus();
            state.drawingScale = false;
        }
        draw2D();
        return;
    }

    // --- Dimension Tool ---
    if (state.activeTool === 'dimension') {
        if (!state.drawingAnnotation) {
            state.annotationStart = clickCoord;
            state.drawingAnnotation = true;
            updateStatus('치수선의 두 번째 끝점을 마우스로 클릭해 주세요.');
        } else {
            const distMm = Math.round(distance(state.annotationStart, clickCoord) * state.scaleRatio);
            saveSnapshot();
            state.annotations.push({
                id: nextId++,
                x1: state.annotationStart.x,
                y1: state.annotationStart.y,
                x2: clickCoord.x,
                y2: clickCoord.y,
                text: `${distMm} mm`,
                floor: state.activeFloor
            });
            state.drawingAnnotation = false;
            draw2D();
            updateStatus('치수 주석이 추가되었습니다.');
        }
        return;
    }

    // --- Guide Tool ---

    if (state.activeTool === 'guide') {
        saveSnapshot();
        const midX = canvas.width / 2;
        const midY = canvas.height / 2;
        const guide = {
            id: nextId++,
            type: Math.abs(clickCoord.x - midX) > Math.abs(clickCoord.y - midY) ? 'v' : 'h',
            pos: Math.abs(clickCoord.x - midX) > Math.abs(clickCoord.y - midY) ? clickCoord.x : clickCoord.y,
            floor: state.activeFloor
        };
        state.guides.push(guide);
        draw2D();
        updateStatus(`가이드라인이 추가되었습니다. (${guide.type === 'h' ? '수평' : '수직'})`);
        return;
    }

    // --- Offset Tool ---
    if (state.activeTool === 'offset') {
        if (state.hoveredWall && state.offsetDistancePx) {
            saveSnapshot();
            
            const wall = state.hoveredWall;
            const dx = wall.x2 - wall.x1;
            const dy = wall.y2 - wall.y1;
            const len = Math.sqrt(dx * dx + dy * dy);
            
            // Normal vector
            const nx = -dy / len;
            const ny = dx / len;
            
            const offsetPx = state.offsetDistancePx;
            
            const newWall = {
                id: nextId++,
                x1: wall.x1 + nx * offsetPx,
                y1: wall.y1 + ny * offsetPx,
                x2: wall.x2 + nx * offsetPx,
                y2: wall.y2 + ny * offsetPx,
                thickness: wall.thickness,
                height: wall.height,
                studSpacing: wall.studSpacing,
                floor: state.activeFloor
            };
            
            state.walls.push(newWall);
            
            syncTo3D();
            updateMaterialTakeoff();
            calculateRooms();
            draw2D();
            updateStatus(`벽체가 평행 복사되었습니다. (거리: ${Math.round(Math.abs(state.offsetDistanceMm))}mm)`);
        } else {
            updateStatus('복사할 기준 벽체 위에 마우스를 위치시켜 주세요.');
        }
        return;
    }

    // --- Wall Tool ---
    if (state.activeTool === 'wall') {
        if (!state.drawingWall) {
            state.wallStart = snapped;
            state.drawingWall = true;
            state.vcbValue = '';
            updateVCBDisplay();
            updateStatus('마우스를 이동하여 벽체 끝점에서 클릭하세요. 숫자 입력 후 Enter로 정확한 치수를 지정할 수 있습니다. (Esc 취소, Shift 각도 스냅)');
        } else {
            const dist = distance(state.wallStart, snapped);
            if (dist * state.scaleRatio > 100) {
                saveSnapshot();
                const thick = parseFloat(document.getElementById('wall-thickness').value);
                const height = parseFloat(document.getElementById('wall-height').value);
                const studSp = parseFloat(document.getElementById('stud-spacing').value);

                const newWall = {
                    id: nextId++,
                    x1: state.wallStart.x,
                    y1: state.wallStart.y,
                    x2: snapped.x,
                    y2: snapped.y,
                    thickness: thick,
                    height: height,
                    studSpacing: studSp,
                    floor: state.activeFloor
                };

                state.walls.push(newWall);
                state.wallStart = snapped; // Chain walls
                state.vcbValue = '';
                updateVCBDisplay();

                syncTo3D();
                updateMaterialTakeoff();
                calculateRooms();
                updateStatus('벽체가 추가되었습니다. 연이어서 그리거나 Esc 키를 눌러 종료하십시오.');
            }
        }
        draw2D();
        return;
    }

    // --- Post Tool ---
    if (state.activeTool === 'post') {
        saveSnapshot();
        const w = parseFloat(document.getElementById('post-width').value);
        const d = parseFloat(document.getElementById('post-depth').value);
        const h = parseFloat(document.getElementById('post-height').value);

        const newPost = {
            id: nextId++,
            x: snapped.x,
            y: snapped.y,
            width: w,
            depth: d,
            height: h,
            floor: state.activeFloor
        };
        state.posts.push(newPost);

        syncTo3D();
        updateMaterialTakeoff();
        calculateRooms();
        draw2D();
        updateStatus('기둥이 추가되었습니다.');
        return;
    }

    // --- Opening Tool ---
    if (state.activeTool === 'opening') {
        if (state.hoveredWall) {
            saveSnapshot();
            const w = parseFloat(document.getElementById('opening-width').value);
            const h = parseFloat(document.getElementById('opening-height').value);
            const type = document.getElementById('opening-type').value;
            const sillH = parseFloat(document.getElementById('opening-sill-height').value);

            const wallStart = { x: state.hoveredWall.x1, y: state.hoveredWall.y1 };
            const wallEnd = { x: state.hoveredWall.x2, y: state.hoveredWall.y2 };
            const proj = projectPointOnSegment(clickCoord, wallStart, wallEnd);

            const wallLengthMm = distance(wallStart, wallEnd) * state.scaleRatio;
            const distFromStartMm = proj.t * wallLengthMm;

            const newOp = {
                id: nextId++,
                wallId: state.hoveredWall.id,
                distance: distFromStartMm,
                width: w,
                height: h,
                sillHeight: type === 'window' ? sillH : 0,
                type: type
            };
            state.openings.push(newOp);

            syncTo3D();
            updateMaterialTakeoff();
            draw2D();
            updateStatus('벽체에 창호가 삽입되었습니다.');
        } else {
            updateStatus('창호를 배치하려면 벽체 위에 마우스를 올리셔야 합니다.');
        }
        return;
    }

    // --- Move Tool ---
    if (state.activeTool === 'move') {
        const clicked = findElementAt(clickCoord);
        if (clicked) {
            state.isDragging = true;
            state.dragStartMouse = { x: clickCoord.x, y: clickCoord.y };

            if (clicked.type === 'wall') {
                state.dragTarget = {
                    type: 'wall', data: clicked.data,
                    origX1: clicked.data.x1, origY1: clicked.data.y1,
                    origX2: clicked.data.x2, origY2: clicked.data.y2
                };
            } else if (clicked.type === 'post') {
                state.dragTarget = {
                    type: 'post', data: clicked.data,
                    origX: clicked.data.x, origY: clicked.data.y
                };
            }
            canvas.style.cursor = 'grabbing';
            saveSnapshot();
        }
        return;
    }

    // --- Select Tool ---
    if (state.activeTool === 'select') {
        // Check for resize handles first
        if (state.activeElement && state.activeElement.type === 'wall') {
            const wall = state.activeElement.data;
            const handleRadius = 8;
            if (distance(clickCoord, { x: wall.x1, y: wall.y1 }) < handleRadius) {
                state.isResizing = true;
                state.resizeTarget = { wall, endpoint: 'start', startMouse: clickCoord };
                saveSnapshot();
                return;
            }
            if (distance(clickCoord, { x: wall.x2, y: wall.y2 }) < handleRadius) {
                state.isResizing = true;
                state.resizeTarget = { wall, endpoint: 'end', startMouse: clickCoord };
                saveSnapshot();
                return;
            }
        }

        const clicked = findElementAt(clickCoord);

        // Multi-select with Shift
        if (e.shiftKey && clicked) {
            const exists = state.selectedElements.findIndex(
                el => el.type === clicked.type && el.data.id === clicked.data.id
            );
            if (exists >= 0) {
                state.selectedElements.splice(exists, 1);
            } else {
                state.selectedElements.push(clicked);
            }
            updateMultiSelectUI();
            draw2D();
            return;
        }

        // Normal select
        state.selectedElements = clicked ? [clicked] : [];
        selectElement(clicked);
        updateMultiSelectUI();

        // Start drag-move in select tool
        if (clicked) {
            state.isDragging = true;
            state.dragStartMouse = { x: clickCoord.x, y: clickCoord.y };
            if (clicked.type === 'wall') {
                state.dragTarget = {
                    type: 'wall', data: clicked.data,
                    origX1: clicked.data.x1, origY1: clicked.data.y1,
                    origX2: clicked.data.x2, origY2: clicked.data.y2
                };
            } else if (clicked.type === 'post') {
                state.dragTarget = {
                    type: 'post', data: clicked.data,
                    origX: clicked.data.x, origY: clicked.data.y
                };
            }
        }
    }
}

function handleMouseMove(e) {
    const mouseCoord = getCanvasCoord(e);
    state._lastMouseCoord = mouseCoord;

    // Pan viewport
    if (state.isPanning) {
        const dx = e.clientX - state.panStart.x;
        const dy = e.clientY - state.panStart.y;
        state.panX += dx;
        state.panY += dy;
        state.panStart = { x: e.clientX, y: e.clientY };
        applyCanvasTransformations();
        return;
    }

    // Display coordinates in status footer
    const realCoord = toRealMm(mouseCoord);
    document.getElementById('coord-x').textContent = `X: ${Math.round(realCoord.x)}mm`;
    document.getElementById('coord-y').textContent = `Y: ${Math.round(realCoord.y)}mm`;

    // Handle resize dragging
    if (state.isResizing && state.resizeTarget) {
        const snapped = applyAllSnaps(mouseCoord);
        const wall = state.resizeTarget.wall;
        if (state.resizeTarget.endpoint === 'start') {
            wall.x1 = snapped.x;
            wall.y1 = snapped.y;
        } else {
            wall.x2 = snapped.x;
            wall.y2 = snapped.y;
        }
        syncTo3D();
        updateMaterialTakeoff();
        calculateRooms();
        draw2D();
        return;
    }

    // Handle drag move
    if (state.isDragging && state.dragTarget && state.dragStartMouse) {
        const dx = mouseCoord.x - state.dragStartMouse.x;
        const dy = mouseCoord.y - state.dragStartMouse.y;

        if (Math.abs(dx) < 3 && Math.abs(dy) < 3) return;

        if (state.dragTarget.type === 'wall') {
            state.dragTarget.data.x1 = state.dragTarget.origX1 + dx;
            state.dragTarget.data.y1 = state.dragTarget.origY1 + dy;
            state.dragTarget.data.x2 = state.dragTarget.origX2 + dx;
            state.dragTarget.data.y2 = state.dragTarget.origY2 + dy;
        } else if (state.dragTarget.type === 'post') {
            state.dragTarget.data.x = state.dragTarget.origX + dx;
            state.dragTarget.data.y = state.dragTarget.origY + dy;
        }

        syncTo3D();
        updateMaterialTakeoff();
        calculateRooms();
        draw2D();
        return;
    }

    const snapped = applyAllSnaps(mouseCoord, state.wallStart);

    // --- Offset tool hover ---
    if (state.activeTool === 'offset') {
        state.hoveredWall = null;
        let closestWall = null;
        let minDist = Infinity;
        
        state.walls.filter(w => (w.floor || '1') === state.activeFloor).forEach(wall => {
            const proj = projectPointOnSegment(mouseCoord, { x: wall.x1, y: wall.y1 }, { x: wall.x2, y: wall.y2 });
            if (proj.dist < minDist && proj.dist < 50) {
                minDist = proj.dist;
                closestWall = wall;
            }
        });
        
        if (closestWall) {
            state.hoveredWall = closestWall;
            const dx = closestWall.x2 - closestWall.x1;
            const dy = closestWall.y2 - closestWall.y1;
            const len = Math.sqrt(dx * dx + dy * dy);
            
            const nx = -dy / len;
            const ny = dx / len;
            const mx = mouseCoord.x - closestWall.x1;
            const my = mouseCoord.y - closestWall.y1;
            
            const offsetPx = mx * nx + my * ny;
            const offsetMm = Math.round(offsetPx * state.scaleRatio);
            
            state.offsetDistancePx = offsetPx;
            state.offsetDistanceMm = offsetMm;
            state.vcbValue = Math.abs(offsetMm).toString();
            updateVCBDisplay();
        } else {
            state.vcbValue = '';
            updateVCBDisplay();
        }
        draw2D();
        return;
    }

    // Opening Hover checking
    if (state.activeTool === 'opening') {
        state.hoveredWall = null;
        for (let wall of state.walls) {
            const proj = projectPointOnSegment(mouseCoord, { x: wall.x1, y: wall.y1 }, { x: wall.x2, y: wall.y2 });
            const thicknessPx = wall.thickness / state.scaleRatio;
            if (proj.dist < thicknessPx / 2 + 10) {
                state.hoveredWall = wall;
                break;
            }
        }
        draw2D();
        return;
    }

    // Dynamic drawing preview lines
    if (state.activeTool === 'wall' && state.drawingWall) {
        draw2D(snapped);
        return;
    }

    if (state.activeTool === 'scale' && state.drawingScale) {
        draw2D(mouseCoord);
        return;
    }

    if (state.activeTool === 'dimension' && state.drawingAnnotation) {
        draw2D(mouseCoord);
        return;
    }


    // Hover cursor feedback
    if (state.activeTool === 'select' || state.activeTool === 'move') {
        const hovered = findElementAt(mouseCoord);
        if (hovered) {
            canvas.style.cursor = state.activeTool === 'move' ? 'grab' : 'pointer';
        } else {
            canvas.style.cursor = state.activeTool === 'move' ? 'move' : 'default';
        }

        if (state.activeTool === 'select' && state.activeElement && state.activeElement.type === 'wall') {
            const wall = state.activeElement.data;
            if (distance(mouseCoord, { x: wall.x1, y: wall.y1 }) < 8 ||
                distance(mouseCoord, { x: wall.x2, y: wall.y2 }) < 8) {
                canvas.style.cursor = 'crosshair';
            }
        }
    }
}

function handleMouseUp(e) {
    state.isPanning = false;

    // Finish resize
    if (state.isResizing) {
        state.isResizing = false;
        state.resizeTarget = null;
        syncTo3D();
        updateMaterialTakeoff();
        calculateRooms();
        draw2D();
        return;
    }

    // Finish drag
    if (state.isDragging && state.dragTarget) {
        const mouseCoord = getCanvasCoord(e);
        const dx = mouseCoord.x - state.dragStartMouse.x;
        const dy = mouseCoord.y - state.dragStartMouse.y;
        const moved = Math.abs(dx) > 3 || Math.abs(dy) > 3;

        if (!moved && state.activeTool === 'move') {
            if (state.undoStack.length > 0) {
                state.undoStack.pop();
            }
        }

        state.isDragging = false;
        state.dragTarget = null;
        state.dragStartMouse = null;
        canvas.style.cursor = state.activeTool === 'move' ? 'move' : 'default';

        if (moved) {
            syncTo3D();
            updateMaterialTakeoff();
            calculateRooms();
            draw2D();
            updateStatus('요소가 이동되었습니다.');
        }
        return;
    }

    // Wall drag-to-draw
    if (state.activeTool === 'wall' && state.drawingWall && state.wallStart) {
        if (e.clientX === undefined && (!e.touches || !e.touches[0])) return;
        const mouseCoord = getCanvasCoord(e);
        const snapped = applyAllSnaps(mouseCoord, state.wallStart);
        const dist = distance(state.wallStart, snapped);

        if (dist > 15) {
            saveSnapshot();
            const thick = parseFloat(document.getElementById('wall-thickness').value);
            const height = parseFloat(document.getElementById('wall-height').value);
            const studSp = parseFloat(document.getElementById('stud-spacing').value);

            const newWall = {
                id: nextId++,
                x1: state.wallStart.x,
                y1: state.wallStart.y,
                x2: snapped.x,
                y2: snapped.y,
                thickness: thick,
                height: height,
                studSpacing: studSp,
                floor: state.activeFloor
            };

            state.walls.push(newWall);
            state.drawingWall = false;
            state.wallStart = null;

            syncTo3D();
            updateMaterialTakeoff();
            calculateRooms();
            draw2D();
            updateStatus('벽체가 드로잉 완료되었습니다.');
        }
    }
}

// ============================================================
// ELEMENT FINDER
// ============================================================
function findElementAt(coord) {
    // Limit selection to elements on active floor
    const activeWalls = state.walls.filter(w => (w.floor || '1') === state.activeFloor);
    const activePosts = state.posts.filter(p => (p.floor || '1') === state.activeFloor);

    // 1. Openings
    for (let op of state.openings) {
        const wall = activeWalls.find(w => w.id === op.wallId);
        if (wall) {
            const wallStart = { x: wall.x1, y: wall.y1 };
            const wallEnd = { x: wall.x2, y: wall.y2 };
            const wallLen = distance(wallStart, wallEnd);
            const t = (op.distance / state.scaleRatio) / wallLen;
            const center = {
                x: wall.x1 + t * (wall.x2 - wall.x1),
                y: wall.y1 + t * (wall.y2 - wall.y1)
            };
            const d = distance(coord, center);
            if (d * state.scaleRatio < Math.max(op.width / 2, 200)) {
                return { type: 'opening', data: op };
            }
        }
    }

    // 2. Posts
    for (let post of activePosts) {
        const postHalfW = (post.width / state.scaleRatio) / 2;
        const postHalfD = (post.depth / state.scaleRatio) / 2;
        if (Math.abs(coord.x - post.x) < postHalfW + 5 &&
            Math.abs(coord.y - post.y) < postHalfD + 5) {
            return { type: 'post', data: post };
        }
    }

    // 3. Walls
    for (let wall of activeWalls) {
        const wallStart = { x: wall.x1, y: wall.y1 };
        const wallEnd = { x: wall.x2, y: wall.y2 };
        const proj = projectPointOnSegment(coord, wallStart, wallEnd);
        const wallThickPx = wall.thickness / state.scaleRatio;
        if (proj.dist < wallThickPx / 2 + 6) {
            return { type: 'wall', data: wall };
        }
    }

    return null;
}

// ============================================================
// SELECTION UI
// ============================================================
function selectElement(element) {
    state.activeElement = element;

    document.getElementById('prop-group-wall').style.display = 'none';
    document.getElementById('prop-group-post').style.display = 'none';
    document.getElementById('prop-group-opening').style.display = 'none';
    document.getElementById('prop-group-multi').style.display = 'none';

    if (!element) {
        draw2D();
        return;
    }

    if (element.type === 'wall') {
        document.getElementById('prop-group-wall').style.display = 'block';
        document.getElementById('wall-thickness').value = element.data.thickness;
        document.getElementById('wall-height').value = element.data.height;
        document.getElementById('stud-spacing').value = element.data.studSpacing;
    } else if (element.type === 'post') {
        document.getElementById('prop-group-post').style.display = 'block';
        document.getElementById('post-width').value = element.data.width;
        document.getElementById('post-depth').value = element.data.depth;
        document.getElementById('post-height').value = element.data.height;
    } else if (element.type === 'opening') {
        document.getElementById('prop-group-opening').style.display = 'block';
        document.getElementById('opening-type').value = element.data.type;
        document.getElementById('opening-width').value = element.data.width;
        document.getElementById('opening-height').value = element.data.height;
        document.getElementById('opening-sill-height').value = element.data.sillHeight || 900;
        document.getElementById('opening-sill-group').style.display = element.data.type === 'window' ? 'block' : 'none';
    }

    draw2D();
}

function updateMultiSelectUI() {
    const panel = document.getElementById('prop-group-multi');
    const countEl = document.getElementById('multi-select-count');
    if (state.selectedElements.length > 1) {
        panel.style.display = 'block';
        countEl.textContent = `${state.selectedElements.length}개 선택됨`;
        document.getElementById('prop-group-wall').style.display = 'none';
        document.getElementById('prop-group-post').style.display = 'none';
        document.getElementById('prop-group-opening').style.display = 'none';
    } else {
        panel.style.display = 'none';
    }
}

// ============================================================
// MIRRORING GEOMETRY (Phase 2)
// ============================================================
function mirrorSelected(axis) {
    const items = state.selectedElements.length > 0
        ? state.selectedElements
        : (state.activeElement ? [state.activeElement] : []);

    if (items.length === 0) return;
    saveSnapshot();

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    items.forEach(el => {
        if (el.type === 'wall') {
            minX = Math.min(minX, el.data.x1, el.data.x2);
            maxX = Math.max(maxX, el.data.x1, el.data.x2);
            minY = Math.min(minY, el.data.y1, el.data.y2);
            maxY = Math.max(maxY, el.data.y1, el.data.y2);
        } else if (el.type === 'post') {
            minX = Math.min(minX, el.data.x);
            maxX = Math.max(maxX, el.data.x);
            minY = Math.min(minY, el.data.y);
            maxY = Math.max(maxY, el.data.y);
        }
    });

    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;

    items.forEach(el => {
        if (el.type === 'wall') {
            if (axis === 'x') {
                el.data.x1 = 2 * midX - el.data.x1;
                el.data.x2 = 2 * midX - el.data.x2;
            } else {
                el.data.y1 = 2 * midY - el.data.y1;
                el.data.y2 = 2 * midY - el.data.y2;
            }
        } else if (el.type === 'post') {
            if (axis === 'x') {
                el.data.x = 2 * midX - el.data.x;
            } else {
                el.data.y = 2 * midY - el.data.y;
            }
        }
    });

    syncTo3D();
    draw2D();
    calculateRooms();
    updateStatus(`선택 요소가 ${axis === 'x' ? '좌우' : '상하'} 미러 대칭되었습니다.`);
}

// ============================================================
// ROOM AREA AUTO-RECOGNITION (Phase 2 half-edge planar graph)
// ============================================================
function calculateRooms() {
    const activeWalls = state.walls.filter(w => (w.floor || '1') === state.activeFloor);
    if (activeWalls.length < 3) {
        state.rooms = [];
        updateRoomListUI();
        return;
    }

    const vertices = [];
    const TOLERANCE = 15; // px

    function getOrCreateVertex(pt) {
        for (let i = 0; i < vertices.length; i++) {
            if (distance(vertices[i], pt) < TOLERANCE) {
                return i;
            }
        }
        vertices.push({ x: pt.x, y: pt.y });
        return vertices.length - 1;
    }

    const edges = [];
    activeWalls.forEach(w => {
        const u = getOrCreateVertex({ x: w.x1, y: w.y1 });
        const v = getOrCreateVertex({ x: w.x2, y: w.y2 });
        if (u !== v) {
            edges.push({ u, v, wall: w });
        }
    });

    const adj = Array.from({ length: vertices.length }, () => []);
    edges.forEach(e => {
        const angleUV = Math.atan2(vertices[e.v].y - vertices[e.u].y, vertices[e.v].x - vertices[e.u].x);
        adj[e.u].push({ to: e.v, angle: angleUV, key: `${e.u}->${e.v}` });

        const angleVU = Math.atan2(vertices[e.u].y - vertices[e.v].y, vertices[e.u].x - vertices[e.v].x);
        adj[e.v].push({ to: e.u, angle: angleVU, key: `${e.v}->${e.u}` });
    });

    adj.forEach(list => list.sort((a, b) => a.angle - b.angle));

    const visited = new Set();
    const faces = [];

    function getNextHalfEdge(fromVer, toVer) {
        const list = adj[toVer];
        const backAngle = Math.atan2(vertices[fromVer].y - vertices[toVer].y, vertices[fromVer].x - vertices[toVer].x);
        let idx = -1;
        let minDiff = Infinity;
        for (let i = 0; i < list.length; i++) {
            let diff = Math.abs(list[i].angle - backAngle);
            if (diff > Math.PI) diff = 2 * Math.PI - diff;
            if (diff < minDiff) {
                minDiff = diff;
                idx = i;
            }
        }
        const nextIdx = (idx + 1) % list.length;
        return list[nextIdx];
    }

    for (let u = 0; u < vertices.length; u++) {
        for (let edge of adj[u]) {
            if (!visited.has(edge.key)) {
                const face = [];
                let currU = u;
                let currEdge = edge;

                while (!visited.has(currEdge.key)) {
                    visited.add(currEdge.key);
                    face.push(currU);
                    currU = currEdge.to;
                    currEdge = getNextHalfEdge(face[face.length - 1], currU);
                }

                if (face.length >= 3) {
                    let area = 0;
                    for (let i = 0; i < face.length; i++) {
                        const p1 = vertices[face[i]];
                        const p2 = vertices[face[(i + 1) % face.length]];
                        area += (p1.x * p2.y) - (p2.x * p1.y);
                    }
                    area = area / 2;

                    if (area > 100) {
                        faces.push({ vertices: face.map(idx => vertices[idx]), areaPx: area });
                    }
                }
            }
        }
    }

    const prevRooms = state.rooms || [];
    state.rooms = faces.map((f, i) => {
        let cx = 0, cy = 0;
        f.vertices.forEach(v => { cx += v.x; cy += v.y; });
        cx /= f.vertices.length;
        cy /= f.vertices.length;

        const areaM2 = (f.areaPx * state.scaleRatio * state.scaleRatio) / 1000000;
        const pyeong = areaM2 * 0.3025;

        // Proximity name matching (preserves user-renamed rooms across edits)
        let name = `공간 / 방 ${i + 1}`;
        let minDist = 50; // px
        prevRooms.forEach(pr => {
            const d = Math.sqrt((pr.center.x - cx) ** 2 + (pr.center.y - cy) ** 2);
            if (d < minDist) {
                minDist = d;
                name = pr.name;
            }
        });

        // VLM label matching — only when the room still has a default name so we
        // never override a name the user (or a prior pass) already set.
        if (/^공간 \/ 방/.test(name)) {
            const labels = (state.roomLabels || []).filter(l => (l.floor || '1') === state.activeFloor);
            const radiusPx = 3000 / state.scaleRatio; // ~3m tolerance, adapts to scale
            let bd = Infinity, bn = null;
            labels.forEach(l => {
                const d = Math.hypot(l.x - cx, l.y - cy);
                if (d < bd) { bd = d; bn = l.name; }
            });
            if (bn && bd < radiusPx) name = bn;
        }

        return {
            id: i + 1,
            name: name,
            areaM2: areaM2,
            pyeong: pyeong,
            center: { x: cx, y: cy },
            pts: f.vertices
        };
    });

    updateRoomListUI();
}

function updateRoomListUI() {
    const listEl = document.getElementById('room-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    if (state.rooms.length === 0) {
        listEl.innerHTML = `
            <div class="takeoff-item" style="color: var(--text-secondary); font-style: italic;">
                벽체가 닫히면 공간 면적이 자동 산출됩니다.
            </div>`;
        return;
    }

    state.rooms.forEach(r => {
        const item = document.createElement('div');
        item.className = 'takeoff-item';
        item.style.padding = '4px 0';
        item.style.borderBottom = '1px solid var(--border-color)';
        item.style.cursor = 'pointer';
        item.title = '클릭하여 공간 이름 변경';
        item.innerHTML = `
            <span style="font-weight: 600; color: var(--text-primary); text-decoration: underline;">${r.name}:</span>
            <strong style="color: var(--accent-color);">${r.areaM2.toFixed(1)}㎡ (${r.pyeong.toFixed(1)}평)</strong>
        `;
        item.addEventListener('click', () => {
            const newName = prompt('공간 이름을 입력해 주세요:', r.name);
            if (newName && newName.trim()) {
                r.name = newName.trim();
                updateRoomListUI();
                draw2D();
            }
        });
        listEl.appendChild(item);
    });
}


// ============================================================
// DELETE / COPY / PASTE
// ============================================================
function deleteSelectedElements() {
    const toDelete = state.selectedElements.length > 0
        ? state.selectedElements
        : (state.activeElement ? [state.activeElement] : []);

    if (toDelete.length === 0) return;
    saveSnapshot();

    toDelete.forEach(el => {
        const id = el.data.id;
        if (el.type === 'wall') {
            state.walls = state.walls.filter(w => w.id !== id);
            state.openings = state.openings.filter(o => o.wallId !== id);
        } else if (el.type === 'post') {
            state.posts = state.posts.filter(p => p.id !== id);
        } else if (el.type === 'opening') {
            state.openings = state.openings.filter(o => o.id !== id);
        }
    });

    selectElement(null);
    state.selectedElements = [];
    updateMultiSelectUI();
    syncTo3D();
    updateMaterialTakeoff();
    calculateRooms();
    draw2D();
    updateStatus(`${toDelete.length}개 요소가 삭제되었습니다.`);
}

function copySelection() {
    const items = state.selectedElements.length > 0
        ? state.selectedElements
        : (state.activeElement ? [state.activeElement] : []);

    if (items.length === 0) return;

    state.clipboard = items.map(el => ({
        type: el.type,
        data: JSON.parse(JSON.stringify(el.data))
    }));

    updateStatus(`${items.length}개 요소가 복사되었습니다.`);
}

function pasteSelection() {
    if (!state.clipboard || state.clipboard.length === 0) return;
    saveSnapshot();

    const offset = 50;
    const newElements = [];

    state.clipboard.forEach(item => {
        const data = JSON.parse(JSON.stringify(item.data));
        data.id = nextId++;

        if (item.type === 'wall') {
            data.x1 += offset;
            data.y1 += offset;
            data.x2 += offset;
            data.y2 += offset;
            data.floor = state.activeFloor;
            state.walls.push(data);
            newElements.push({ type: 'wall', data });
        } else if (item.type === 'post') {
            data.x += offset;
            data.y += offset;
            data.floor = state.activeFloor;
            state.posts.push(data);
            newElements.push({ type: 'post', data });
        }
    });

    state.selectedElements = newElements;
    updateMultiSelectUI();
    syncTo3D();
    updateMaterialTakeoff();
    calculateRooms();
    draw2D();
    updateStatus(`${newElements.length}개 요소가 붙여넣기 되었습니다.`);
}

function cancelActiveDrawing() {
    state.drawingWall = false;
    state.wallStart = null;
    state.drawingScale = false;
    state.drawingGuide = false;
    state.isDragging = false;
    state.isResizing = false;
    state.vcbValue = '';
    updateVCBDisplay();
    setTool('select');
    document.getElementById('tool-select').classList.add('active');
    draw2D();
}

// ============================================================
// PROJECT SAVE / LOAD
// ============================================================
function saveProject() {
    const project = {
        version: '2.0',
        timestamp: new Date().toISOString(),
        scaleRatio: state.scaleRatio,
        scaleSet: state.scaleSet,
        bgWidth: state.bgWidth,
        bgHeight: state.bgHeight,
        activeFloor: state.activeFloor,
        walls: state.walls,
        posts: state.posts,
        openings: state.openings,
        guides: state.guides,
        nextId: nextId
    };

    const json = JSON.stringify(project, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const link = document.createElement('a');
    link.download = `timber-project-${new Date().toISOString().slice(0, 10)}.json`;
    link.href = URL.createObjectURL(blob);
    link.click();
    updateStatus('프로젝트가 저장되었습니다.');
}

function loadProject(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (event) {
        try {
            const project = JSON.parse(event.target.result);

            saveSnapshot();

            state.scaleRatio = project.scaleRatio || 1.0;
            state.scaleSet = project.scaleSet || false;
            state.walls = project.walls || [];
            state.posts = project.posts || [];
            state.openings = project.openings || [];
            state.guides = project.guides || [];
            state.activeFloor = project.activeFloor || '1';
            nextId = project.nextId || 1;

            state.walls.forEach(w => { if (!w.floor) w.floor = '1'; });
            state.posts.forEach(p => { if (!p.floor) p.floor = '1'; });
            state.guides.forEach(g => { if (!g.floor) g.floor = '1'; });

            const floorSelect = document.getElementById('floor-select');
            if (floorSelect) floorSelect.value = state.activeFloor;

            if (project.bgWidth && project.bgHeight) {
                resizeCanvas(project.bgWidth, project.bgHeight);
            }

            if (state.scaleSet) {
                document.getElementById('scale-status').textContent = `척도: 1px = ${state.scaleRatio.toFixed(2)}mm`;
                document.getElementById('scale-status').classList.add('active');
            }

            selectElement(null);
            state.selectedElements = [];
            updateMultiSelectUI();
            syncTo3D();
            updateMaterialTakeoff();
            calculateRooms();
            draw2D();
            updateStatus(`프로젝트가 불러와졌습니다. (벽체 ${state.walls.length}개, 기둥 ${state.posts.length}개)`);
        } catch (err) {
            console.error(err);
            updateStatus('프로젝트 파일 파싱에 실패했습니다.');
        }
    };
    reader.readAsText(file);
    e.target.value = '';
}

// ============================================================
// PAN & ZOOM
// ============================================================
function handleWheel(e) {
    e.preventDefault();
    const zoomIntensity = 0.1;
    const viewport = document.getElementById('canvas-viewport');
    const rect = viewport.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const canvasMouseX = (mouseX - state.panX) / state.zoomScale;
    const canvasMouseY = (mouseY - state.panY) / state.zoomScale;

    if (e.deltaY < 0) {
        state.zoomScale *= (1 + zoomIntensity);
    } else {
        state.zoomScale /= (1 + zoomIntensity);
    }
    state.zoomScale = Math.max(0.1, Math.min(10, state.zoomScale));

    state.panX = mouseX - canvasMouseX * state.zoomScale;
    state.panY = mouseY - canvasMouseY * state.zoomScale;

    applyCanvasTransformations();
}

function applyCanvasTransformations() {
    canvas.style.transformOrigin = 'top left';
    canvas.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoomScale})`;
}

// ============================================================
// 2D CANVAS DRAWING ENGINE
// ============================================================
function draw2D(previewPoint = null) {
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (state.bgImage) {
        ctx.drawImage(state.bgImage, 0, 0);
    } else {
        ctx.fillStyle = document.body.classList.contains('light-theme') ? '#ffffff' : '#141416';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    drawGrid();
    drawRoomFills();
    drawGuides();
    drawElementsAcrossFloors();

    if (state.activeElement && state.activeElement.type === 'wall') {
        drawResizeHandles(state.activeElement.data);
    }

    if (previewPoint && previewPoint._snappedEndpoint) {
        drawSnapIndicator(previewPoint);
    }

    if (state.activeTool === 'offset' && state.hoveredWall && state.offsetDistancePx) {
        drawOffsetPreview();
    }

    if (state.activeTool === 'wall' && state.drawingWall && previewPoint) {
        drawWallPreview(previewPoint);
    }

    if (state.activeTool === 'scale' && state.drawingScale && previewPoint) {
        drawScalePreview(previewPoint);
    }

    if (state.activeTool === 'dimension' && state.drawingAnnotation && previewPoint) {
        drawDimensionPreview(previewPoint);
    }


    if (state.activeTool === 'opening' && state.hoveredWall && previewPoint) {
        const wall = state.hoveredWall;
        const proj = projectPointOnSegment(previewPoint, { x: wall.x1, y: wall.y1 }, { x: wall.x2, y: wall.y2 });
        ctx.strokeStyle = '#1dd1a1';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(proj.pt.x, proj.pt.y, 8, 0, Math.PI * 2);
        ctx.stroke();
    }
}

function drawRoomFills() {
    state.rooms.forEach(r => {
        ctx.save();
        ctx.fillStyle = 'rgba(29, 209, 161, 0.1)';
        ctx.strokeStyle = 'rgba(29, 209, 161, 0.2)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(r.pts[0].x, r.pts[0].y);
        for (let i = 1; i < r.pts.length; i++) {
            ctx.lineTo(r.pts[i].x, r.pts[i].y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#1dd1a1';
        ctx.font = 'bold 11px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(r.name, r.center.x, r.center.y - 7);
        ctx.font = '9px monospace';
        ctx.fillText(`${r.areaM2.toFixed(1)}㎡ (${r.pyeong.toFixed(1)}평)`, r.center.x, r.center.y + 7);
        ctx.restore();
    });
}

function drawElementsAcrossFloors() {
    // 1. Draw foundation
    if (!state.layers || state.layers.foundation !== false) {
        draw2DFoundation();
    }

    // 2. Draw Floor Joists
    if (!state.layers || state.layers.joists !== false) {
        draw2DJoists();
    }

    ctx.save();
    ctx.globalAlpha = 0.15;
    
    if (!state.layers || state.layers.walls !== false) {
        state.walls.filter(w => (w.floor || '1') !== state.activeFloor).forEach(wall => {
            draw2DWall(wall, false, true);
        });
    }
    if (!state.layers || state.layers.posts !== false) {
        state.posts.filter(p => (p.floor || '1') !== state.activeFloor).forEach(post => {
            draw2DPost(post, false);
        });
    }

    ctx.restore();

    const activeWalls = state.walls.filter(w => (w.floor || '1') === state.activeFloor);
    const activePosts = state.posts.filter(p => (p.floor || '1') === state.activeFloor);

    if (!state.layers || state.layers.walls !== false) {
        activeWalls.forEach(wall => {
            const isSelected = isElementSelected('wall', wall.id);
            draw2DWall(wall, isSelected, false);
        });
    }

    if (!state.layers || state.layers.openings !== false) {
        state.openings.forEach(op => {
            const isSelected = isElementSelected('opening', op.id);
            draw2DOpening(op, isSelected);
        });
    }

    if (!state.layers || state.layers.posts !== false) {
        activePosts.forEach(post => {
            const isSelected = isElementSelected('post', post.id);
            draw2DPost(post, isSelected);
        });
    }

    // 3. Draw Roof dashed outline
    if (!state.layers || state.layers.roof !== false) {
        draw2DRoofOutline();
    }

    // 4. Draw user-defined dimension annotations
    if (!state.layers || state.layers.annotations !== false) {
        draw2DAnnotations();
    }
}


function isElementSelected(type, id) {
    if (state.activeElement && state.activeElement.type === type && state.activeElement.data.id === id) return true;
    return state.selectedElements.some(el => el.type === type && el.data.id === id);
}

function drawGrid() {
    const isDark = document.body.classList.contains('dark-theme');
    ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)';
    ctx.lineWidth = 1.0;

    const gridPx = state.gridSizeMm / state.scaleRatio;
    if (gridPx < 8) return;

    for (let x = 0; x < canvas.width; x += gridPx) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }

    for (let y = 0; y < canvas.height; y += gridPx) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }
}

function drawGuides() {
    ctx.save();
    ctx.setLineDash([8, 4]);
    ctx.strokeStyle = 'rgba(84, 160, 255, 0.6)';
    ctx.lineWidth = 1;

    state.guides.filter(g => (g.floor || '1') === state.activeFloor).forEach(g => {
        ctx.beginPath();
        if (g.type === 'h') {
            ctx.moveTo(0, g.pos);
            ctx.lineTo(canvas.width, g.pos);
        } else {
            ctx.moveTo(g.pos, 0);
            ctx.lineTo(g.pos, canvas.height);
        }
        ctx.stroke();
    });
    ctx.setLineDash([]);
    ctx.restore();
}

function draw2DWall(wall, isSelected, isGhost = false) {
    const dx = wall.x2 - wall.x1;
    const dy = wall.y2 - wall.y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);
    const thicknessPx = wall.thickness / state.scaleRatio;

    ctx.save();
    ctx.translate(wall.x1, wall.y1);
    ctx.rotate(angle);

    ctx.fillStyle = isSelected ? 'rgba(255, 159, 67, 0.25)' : 'rgba(100, 100, 110, 0.15)';
    ctx.fillRect(0, -thicknessPx / 2, len, thicknessPx);

    ctx.strokeStyle = isSelected ? '#ff9f43' : (isGhost ? 'rgba(113, 128, 147, 0.4)' : '#718093');
    ctx.lineWidth = isSelected ? 3 : 2;
    if (isGhost) ctx.setLineDash([5, 5]);
    ctx.strokeRect(0, -thicknessPx / 2, len, thicknessPx);
    ctx.setLineDash([]);

    const LUMBER_T_PX = 38 / state.scaleRatio;
    const studSpacingPx = wall.studSpacing / state.scaleRatio;

    ctx.fillStyle = isGhost ? 'rgba(230, 175, 115, 0.2)' : 'rgba(230, 175, 115, 0.7)';
    ctx.fillRect(0, -thicknessPx / 2 + 1, LUMBER_T_PX, thicknessPx - 2);
    ctx.fillRect(len - LUMBER_T_PX, -thicknessPx / 2 + 1, LUMBER_T_PX, thicknessPx - 2);

    const wallOps = state.openings.filter(op => op.wallId === wall.id);
    const ranges = wallOps.map(op => {
        const oStart = (op.distance - op.width / 2) / state.scaleRatio;
        const oEnd = (op.distance + op.width / 2) / state.scaleRatio;
        return { start: oStart - LUMBER_T_PX, end: oEnd + LUMBER_T_PX };
    });

    for (let x = studSpacingPx; x < len - LUMBER_T_PX; x += studSpacingPx) {
        const isInside = ranges.some(r => x > r.start && x < r.end);
        if (!isInside) {
            ctx.fillRect(x, -thicknessPx / 2 + 1, LUMBER_T_PX, thicknessPx - 2);
        }
    }

    if (!isGhost && (state.showDimensions || isSelected)) {
        const realLen = Math.round(len * state.scaleRatio);
        ctx.fillStyle = isSelected ? '#ff9f43' : 'rgba(255,255,255,0.5)';
        if (document.body.classList.contains('light-theme')) {
            ctx.fillStyle = isSelected ? '#e67e22' : 'rgba(0,0,0,0.4)';
        }
        ctx.font = `bold ${isSelected ? 12 : 10}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(`${realLen} mm`, len / 2, -thicknessPx / 2 - 6);
    }

    ctx.restore();
}

function draw2DPost(post, isSelected) {
    const wPx = post.width / state.scaleRatio;
    const dPx = post.depth / state.scaleRatio;

    ctx.save();
    ctx.translate(post.x, post.y);

    ctx.fillStyle = isSelected ? 'rgba(255, 159, 67, 0.4)' : 'rgba(230, 160, 90, 0.7)';
    ctx.fillRect(-wPx / 2, -dPx / 2, wPx, dPx);

    ctx.strokeStyle = isSelected ? '#ff9f43' : '#b27b43';
    ctx.lineWidth = isSelected ? 3 : 2;
    ctx.strokeRect(-wPx / 2, -dPx / 2, wPx, dPx);

    ctx.beginPath();
    ctx.moveTo(-wPx / 2, -dPx / 2);
    ctx.lineTo(wPx / 2, dPx / 2);
    ctx.moveTo(wPx / 2, -dPx / 2);
    ctx.lineTo(-wPx / 2, dPx / 2);
    ctx.stroke();

    ctx.restore();
}

function draw2DOpening(op, isSelected) {
    const wall = state.walls.find(w => w.id === op.wallId);
    if (!wall || (wall.floor || '1') !== state.activeFloor) return;

    const angle = Math.atan2(wall.y2 - wall.y1, wall.x2 - wall.x1);
    const wallLen = distance({ x: wall.x1, y: wall.y1 }, { x: wall.x2, y: wall.y2 });
    const t = (op.distance / state.scaleRatio) / wallLen;
    const px = wall.x1 + t * (wall.x2 - wall.x1);
    const py = wall.y1 + t * (wall.y2 - wall.y1);
    const opWidthPx = op.width / state.scaleRatio;
    const thicknessPx = wall.thickness / state.scaleRatio;

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(angle);

    ctx.fillStyle = document.body.classList.contains('light-theme') ? '#ffffff' : '#141416';
    if (state.bgImage) {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillRect(-opWidthPx / 2, -thicknessPx / 2 - 2, opWidthPx, thicknessPx + 4);
        ctx.globalCompositeOperation = 'source-over';
    } else {
        ctx.fillRect(-opWidthPx / 2, -thicknessPx / 2 - 1, opWidthPx, thicknessPx + 2);
    }

    if (op.type === 'door') {
        ctx.strokeStyle = isSelected ? '#ff9f43' : '#1dd1a1';
        ctx.lineWidth = isSelected ? 3 : 2;

        ctx.beginPath();
        ctx.moveTo(-opWidthPx / 2, -thicknessPx / 2);
        ctx.lineTo(-opWidthPx / 2, thicknessPx / 2);
        ctx.moveTo(opWidthPx / 2, -thicknessPx / 2);
        ctx.lineTo(opWidthPx / 2, thicknessPx / 2);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(-opWidthPx / 2, thicknessPx / 2);
        ctx.lineTo(-opWidthPx / 2, thicknessPx / 2 + opWidthPx);
        ctx.stroke();

        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(-opWidthPx / 2, thicknessPx / 2, opWidthPx, 0, -Math.PI / 2, true);
        ctx.stroke();
        ctx.setLineDash([]);
    } else {
        ctx.fillStyle = 'rgba(173, 203, 227, 0.4)';
        ctx.fillRect(-opWidthPx / 2, -thicknessPx / 4, opWidthPx, thicknessPx / 2);

        ctx.strokeStyle = isSelected ? '#ff9f43' : '#1dd1a1';
        ctx.lineWidth = isSelected ? 3 : 2;
        ctx.strokeRect(-opWidthPx / 2, -thicknessPx / 2, opWidthPx, thicknessPx);

        ctx.beginPath();
        ctx.moveTo(-opWidthPx / 2, 0);
        ctx.lineTo(opWidthPx / 2, 0);
        ctx.stroke();
    }

    ctx.restore();
}

function drawResizeHandles(wall) {
    const handleRadius = 6;

    [{ x: wall.x1, y: wall.y1 }, { x: wall.x2, y: wall.y2 }].forEach(pt => {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, handleRadius, 0, Math.PI * 2);
        ctx.fillStyle = '#ff9f43';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
    });
}

function drawSnapIndicator(pt) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 10, 0, Math.PI * 2);
    ctx.strokeStyle = '#1dd1a1';
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 3]);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#1dd1a1';
    ctx.fill();
    ctx.restore();
}

function drawOffsetPreview() {
    const wall = state.hoveredWall;
    const dx = wall.x2 - wall.x1;
    const dy = wall.y2 - wall.y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    
    const nx = -dy / len;
    const ny = dx / len;
    
    const offsetPx = state.offsetDistancePx;
    
    ctx.save();
    ctx.strokeStyle = 'rgba(29, 209, 161, 0.7)';
    ctx.lineWidth = wall.thickness / state.scaleRatio;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(wall.x1 + nx * offsetPx, wall.y1 + ny * offsetPx);
    ctx.lineTo(wall.x2 + nx * offsetPx, wall.y2 + ny * offsetPx);
    ctx.stroke();
    ctx.setLineDash([]);

    const midX = (wall.x1 + wall.x2) / 2 + nx * offsetPx;
    const midY = (wall.y1 + wall.y2) / 2 + ny * offsetPx;
    
    ctx.fillStyle = '#1dd1a1';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.round(Math.abs(state.offsetDistanceMm))} mm`, midX, midY - 12);
    ctx.restore();
}

function drawWallPreview(previewPoint) {
    ctx.strokeStyle = '#ff9f43';
    ctx.lineWidth = Math.max(2, parseFloat(document.getElementById('wall-thickness').value) / state.scaleRatio);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(state.wallStart.x, state.wallStart.y);
    ctx.lineTo(previewPoint.x, previewPoint.y);
    ctx.stroke();

    const dPx = distance(state.wallStart, previewPoint);
    const dMm = Math.round(dPx * state.scaleRatio);
    ctx.fillStyle = '#ff9f43';
    ctx.font = 'bold 12px monospace';
    ctx.fillText(` ${dMm} mm`, previewPoint.x + 10, previewPoint.y - 10);

    if (state.shiftHeld) {
        const angle = Math.atan2(previewPoint.y - state.wallStart.y, previewPoint.x - state.wallStart.x);
        const angleDeg = Math.round(angle * 180 / Math.PI);
        ctx.fillStyle = 'rgba(29, 209, 161, 0.8)';
        ctx.font = 'bold 11px monospace';
        ctx.fillText(` ${angleDeg}°`, previewPoint.x + 10, previewPoint.y + 5);
    }
}

function drawScalePreview(previewPoint) {
    ctx.strokeStyle = '#ff3838';
    ctx.lineWidth = 3;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(state.scaleStart.x, state.scaleStart.y);
    ctx.lineTo(previewPoint.x, previewPoint.y);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#ff3838';
    ctx.beginPath();
    ctx.arc(state.scaleStart.x, state.scaleStart.y, 6, 0, Math.PI * 2);
    ctx.arc(previewPoint.x, previewPoint.y, 6, 0, Math.PI * 2);
    ctx.fill();
}

// ============================================================
// MATERIAL TAKEOFF
// ============================================================
function updateMaterialTakeoff() {
    let totalWallLenMm = 0;
    let totalStuds = 0;
    let totalPlatesLenMm = 0;
    let totalPosts = state.posts.length;
    let f1WallLenMm = 0;
    const LUMBER_T = 38;

    state.walls.forEach(wall => {
        const dx = wall.x2 - wall.x1;
        const dy = wall.y2 - wall.y1;
        const wallLenMm = Math.sqrt(dx * dx + dy * dy) * state.scaleRatio;

        totalWallLenMm += wallLenMm;
        if ((wall.floor || '1') === '1') {
            f1WallLenMm += wallLenMm;
        }
        let wallPlatesMm = wallLenMm * 3;

        const wallOps = state.openings.filter(o => o.wallId === wall.id);
        wallOps.forEach(op => {
            if (op.type === 'door') {
                wallPlatesMm -= op.width;
            }
        });
        totalPlatesLenMm += wallPlatesMm;

        let wallStuds = 0;
        let regularStudCoords = [];
        for (let x = 0; x <= wallLenMm; x += wall.studSpacing) {
            regularStudCoords.push(x);
        }
        if (regularStudCoords[regularStudCoords.length - 1] !== wallLenMm) {
            regularStudCoords.push(wallLenMm);
        }

        const ranges = wallOps.map(op => {
            const oStart = op.distance - op.width / 2;
            const oEnd = op.distance + op.width / 2;
            wallStuds += 4;
            if (op.type === 'window' && op.sillHeight > LUMBER_T) {
                for (let cx = oStart + wall.studSpacing - (oStart % wall.studSpacing); cx < oEnd; cx += wall.studSpacing) {
                    wallStuds += 1;
                }
            }
            for (let cx = oStart; cx <= oEnd; cx += wall.studSpacing) {
                if (cx >= oStart + LUMBER_T && cx <= oEnd - LUMBER_T) {
                    wallStuds += 1;
                }
            }
            return { start: oStart - LUMBER_T, end: oEnd + LUMBER_T };
        });

        regularStudCoords.forEach(x => {
            const isInside = ranges.some(r => x > r.start && x < r.end);
            if (!isInside) wallStuds += 1;
        });

        totalStuds += wallStuds;
    });

    const totalRafters = calculateRaftersCount();

    // Cost Estimations
    const costStudsVal = totalStuds * state.unitPrices.stud;
    const costPlatesVal = Math.round((totalPlatesLenMm / 1000) * state.unitPrices.plate);
    const costRaftersVal = totalRafters * state.unitPrices.rafter;
    const costPostsVal = totalPosts * state.unitPrices.post;
    const concreteVolumeM3 = (f1WallLenMm / 1000) * 0.4 * 0.6; // 400mm width, 600mm depth
    const costConcreteVal = Math.round(concreteVolumeM3 * state.unitPrices.concrete);
    const costTotalVal = costStudsVal + costPlatesVal + costRaftersVal + costPostsVal + costConcreteVal;

    // Update Takeoff Display
    document.getElementById('takeoff-wall-len').textContent = `${(totalWallLenMm / 1000).toFixed(1)} m`;
    document.getElementById('takeoff-stud-count').textContent = `${totalStuds} 개`;
    document.getElementById('takeoff-plate-len').textContent = `${(totalPlatesLenMm / 1000).toFixed(1)} m`;
    document.getElementById('takeoff-post-count').textContent = `${totalPosts} 개`;
    document.getElementById('takeoff-rafter-count').textContent = `${totalRafters} 개`;

    // Update Cost Display
    document.getElementById('cost-studs').textContent = `₩${costStudsVal.toLocaleString()}`;
    document.getElementById('cost-plates').textContent = `₩${costPlatesVal.toLocaleString()}`;
    document.getElementById('cost-rafters').textContent = `₩${costRaftersVal.toLocaleString()}`;
    document.getElementById('cost-total').textContent = `₩${costTotalVal.toLocaleString()}`;
}


// ============================================================
// THEME
// ============================================================
function toggleTheme() {
    const isDark = document.body.classList.contains('dark-theme');
    if (isDark) {
        document.body.classList.remove('dark-theme');
        document.body.classList.add('light-theme');
        set3DTheme(false);
    } else {
        document.body.classList.remove('light-theme');
        document.body.classList.add('dark-theme');
        set3DTheme(true);
    }
    syncThemeIcon();
    draw2D();
}

function syncThemeIcon() {
    const isDark = document.body.classList.contains('dark-theme');
    const icon = document.getElementById('theme-icon');
    if (icon) icon.textContent = isDark ? '☀️' : '🌙';
}

// ============================================================
// EXPORT FUNCTIONS
// ============================================================
function exportImages() {
    const link2D = document.createElement('a');
    link2D.download = 'timber-plan-2d.png';
    link2D.href = canvas.toDataURL();
    link2D.click();

    if (renderer && scene && camera) {
        renderer.render(scene, camera);
        const link3D = document.createElement('a');
        link3D.download = 'timber-plan-3d.png';
        link3D.href = renderer.domElement.toDataURL('image/png');
        link3D.click();
    }
    updateStatus('2D 평면도와 3D 모델 이미지가 정상적으로 내보내기 되었습니다.');
}

function exportToDXF() {
    if (state.walls.length === 0 && state.posts.length === 0) {
        alert('내보낼 도면 요소가 없습니다.');
        return;
    }

    let dxf = `  0\nSECTION\n  2\nHEADER\n  0\nENDSEC\n  0\nSECTION\n  2\nENTITIES\n`;

    state.walls.forEach(wall => {
        const p1 = toRealMm({ x: wall.x1, y: wall.y1 });
        const p2 = toRealMm({ x: wall.x2, y: wall.y2 });
        dxf += `  0\nLINE\n  8\nWalls_Centerline\n 10\n${p1.x}\n 20\n${p1.y}\n 30\n0.0\n 11\n${p2.x}\n 21\n${p2.y}\n 31\n0.0\n`;

        const dx = wall.x2 - wall.x1;
        const dy = wall.y2 - wall.y1;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len > 0) {
            const nx = -dy / len;
            const ny = dx / len;
            const halfThick = wall.thickness / 2;
            dxf += `  0\nLINE\n  8\nWalls_Boundary\n 10\n${p1.x + nx * halfThick}\n 20\n${p1.y + ny * halfThick}\n 30\n0.0\n 11\n${p2.x + nx * halfThick}\n 21\n${p2.y + ny * halfThick}\n 31\n0.0\n`;
            dxf += `  0\nLINE\n  8\nWalls_Boundary\n 10\n${p1.x - nx * halfThick}\n 20\n${p1.y - ny * halfThick}\n 30\n0.0\n 11\n${p2.x - nx * halfThick}\n 21\n${p2.y - ny * halfThick}\n 31\n0.0\n`;
        }
    });

    state.posts.forEach(post => {
        const center = toRealMm({ x: post.x, y: post.y });
        const halfW = post.width / 2;
        const halfD = post.depth / 2;
        const corners = [
            { x: center.x - halfW, y: center.y - halfD },
            { x: center.x + halfW, y: center.y - halfD },
            { x: center.x + halfW, y: center.y + halfD },
            { x: center.x - halfW, y: center.y + halfD }
        ];
        for (let i = 0; i < 4; i++) {
            const next = (i + 1) % 4;
            dxf += `  0\nLINE\n  8\nPosts\n 10\n${corners[i].x}\n 20\n${corners[i].y}\n 30\n0.0\n 11\n${corners[next].x}\n 21\n${corners[next].y}\n 31\n0.0\n`;
        }
    });

    dxf += `  0\nENDSEC\n  0\nEOF\n`;

    const blob = new Blob([dxf], { type: 'application/dxf' });
    const link = document.createElement('a');
    link.download = 'timber-plan-cad.dxf';
    link.href = URL.createObjectURL(blob);
    link.click();
    updateStatus('CAD(DXF) 파일이 성공적으로 다운로드되었습니다.');
}

function exportToOBJ() {
    if (!elementsGroup || elementsGroup.children.length === 0) {
        alert('내보낼 3D 골조 모델이 없습니다.');
        return;
    }

    let objText = "# Timber House Designer 3D OBJ Export\n# Units: Millimeters (mm)\n\n";
    let vertexCount = 0;

    function traverse(obj) {
        if (obj instanceof THREE.Mesh) {
            if (obj.material && (obj.material.transparent || obj.material.opacity < 0.9)) return;

            const geom = obj.geometry;
            if (geom && geom.isBoxGeometry) {
                obj.updateMatrixWorld(true);
                const params = geom.parameters;
                const w = params.width, h = params.height, d = params.depth;

                const localVertices = [
                    new THREE.Vector3(-w / 2, -h / 2, -d / 2),
                    new THREE.Vector3(w / 2, -h / 2, -d / 2),
                    new THREE.Vector3(w / 2, h / 2, -d / 2),
                    new THREE.Vector3(-w / 2, h / 2, -d / 2),
                    new THREE.Vector3(-w / 2, -h / 2, d / 2),
                    new THREE.Vector3(w / 2, -h / 2, d / 2),
                    new THREE.Vector3(w / 2, h / 2, d / 2),
                    new THREE.Vector3(-w / 2, h / 2, d / 2)
                ];

                localVertices.forEach(v => {
                    v.applyMatrix4(obj.matrixWorld);
                    objText += `v ${v.x.toFixed(2)} ${v.y.toFixed(2)} ${v.z.toFixed(2)}\n`;
                });

                const startIdx = vertexCount + 1;
                const boxFaces = [
                    [1, 2, 3, 4], [5, 8, 7, 6], [1, 5, 6, 2],
                    [3, 7, 8, 4], [1, 4, 8, 5], [2, 6, 7, 3]
                ];
                boxFaces.forEach(f => {
                    objText += `f ${f[0] + startIdx - 1} ${f[1] + startIdx - 1} ${f[2] + startIdx - 1} ${f[3] + startIdx - 1}\n`;
                });
                vertexCount += 8;
            }
        }
        if (obj.children) obj.children.forEach(child => traverse(child));
    }

    traverse(elementsGroup);

    const blob = new Blob([objText], { type: 'text/plain' });
    const link = document.createElement('a');
    link.download = 'timber-frame-3d.obj';
    link.href = URL.createObjectURL(blob);
    link.click();
    updateStatus('스케치업 3D(OBJ) 파일이 성공적으로 다운로드되었습니다.');
}

// ============================================================
// AUTO TRACE BLUEPRINT
// ============================================================
function autoTraceBlueprint() {
    if (!state.bgImage) {
        updateStatus('분석할 도면 이미지가 없습니다. 먼저 도면을 업로드해 주세요.');
        alert('분석할 도면 이미지가 없습니다.');
        return;
    }

    updateStatus('도면 이미지를 서버로 전송해 벽선을 인식하는 중입니다...');

    const imgW = state.bgImage.width;
    const imgH = state.bgImage.height;

    if (!state.scaleSet) {
        state.scaleRatio = 15000 / imgW;
        state.scaleSet = true;
        document.getElementById('scale-status').textContent = `척도: 1px = ${state.scaleRatio.toFixed(2)}mm (임시)`;
        document.getElementById('scale-status').classList.add('active');
    }

    // Rasterize the loaded blueprint to a (capped) data URL so the CV pipeline
    // can actually see the drawing. Payload is capped to keep the POST small.
    const MAX_SEND_DIM = 2000;
    let sendW = imgW, sendH = imgH;
    const longSide = Math.max(imgW, imgH);
    if (longSide > MAX_SEND_DIM) {
        const r = MAX_SEND_DIM / longSide;
        sendW = Math.round(imgW * r);
        sendH = Math.round(imgH * r);
    }
    const sendCanvas = document.createElement('canvas');
    sendCanvas.width = sendW;
    sendCanvas.height = sendH;
    sendCanvas.getContext('2d').drawImage(state.bgImage, 0, 0, sendW, sendH);
    const imageDataUrl = sendCanvas.toDataURL('image/jpeg', 0.85);

    fetch('/website/analyze-blueprint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: imageDataUrl, width: imgW, height: imgH })
    })
    .then(res => res.json())
    .then(data => {
        if (data && data.ok && Array.isArray(data.walls) && data.walls.length) {
            saveSnapshot();
            const thick = parseFloat(document.getElementById('wall-thickness').value) || 140;
            const height = parseFloat(document.getElementById('wall-height').value) || 2700;
            const studSp = parseFloat(document.getElementById('stud-spacing').value) || 400;

            // Phase 2: apply OCR-detected scale (mm per pixel) if available.
            let autoScaleMsg = '';
            if (data.scale && data.scale.ok && data.scale.mm_per_px > 0) {
                state.scaleRatio = data.scale.mm_per_px;
                state.scaleSet = true;
                const scaleEl = document.getElementById('scale-status');
                if (scaleEl) {
                    scaleEl.textContent = `척도: 1px = ${state.scaleRatio.toFixed(2)}mm (치수 자동인식)`;
                    scaleEl.classList.add('active');
                }
                autoScaleMsg = ` 척도 자동설정(1px≈${state.scaleRatio.toFixed(2)}mm).`;
            }

            // OpenCV returns image-pixel coords (= model coords). Legacy box
            // returns millimetres, which must be converted to model pixels.
            const isPixelSpace = data.coord_space === 'image_px';
            const mmToPx = 1 / state.scaleRatio;
            // When the CV result is in image pixels but the image was analyzed at
            // full resolution, map straight through (bgImage draws 1:1 in world).
            const sx = isPixelSpace ? 1 : mmToPx;
            const sy = isPixelSpace ? 1 : mmToPx;

            const newWalls = [];
            data.walls.forEach(w => {
                newWalls.push({
                    id: nextId++,
                    x1: w.x1 * sx,
                    y1: w.y1 * sy,
                    x2: w.x2 * sx,
                    y2: w.y2 * sy,
                    thickness: thick,
                    height: height,
                    studSpacing: studSp,
                    floor: state.activeFloor
                });
            });

            state.walls = state.walls.concat(newWalls);
            updateMaterialTakeoff();
            calculateRooms();
            draw2D();
            syncTo3D();
            updateStatus((data.message || `도면 분석 완료: 벽체 ${newWalls.length}개 생성.`) + autoScaleMsg);
        } else {
            const reason = data && data.message ? ` (${data.message})` : '';
            updateStatus(`서버 벽선 인식 실패, 로컬 분석으로 대체합니다.${reason}`);
            fallbackLocalPixelTrace();
        }
    })
    .catch(err => {
        console.warn('[TimberDesigner] Blueprint CV API fallback:', err);
        fallbackLocalPixelTrace();
    });
}

function fallbackLocalPixelTrace() {
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');

    const maxDim = 1000;
    let w = state.bgImage.width;
    let h = state.bgImage.height;
    if (w > maxDim || h > maxDim) {
        const ratio = Math.min(maxDim / w, maxDim / h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
    }

    tempCanvas.width = w;
    tempCanvas.height = h;
    tempCtx.drawImage(state.bgImage, 0, 0, w, h);

    const imgData = tempCtx.getImageData(0, 0, w, h);
    const data = imgData.data;

    const isDark = (x, y) => {
        if (x < 0 || x >= w || y < 0 || y >= h) return false;
        const idx = (y * w + x) * 4;
        const a = data[idx + 3];
        if (a < 50) return false;
        const gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
        return gray < 130;
    };

    const horizontalSegments = [];
    const minWallLen = 40;
    const step = 4;

    for (let y = step; y < h - step; y += step) {
        let inSegment = false;
        let startX = 0;
        for (let x = 0; x < w; x++) {
            const dark = isDark(x, y);
            if (dark && !inSegment) { startX = x; inSegment = true; }
            else if (!dark && inSegment) {
                if (x - startX >= minWallLen) horizontalSegments.push({ x1: startX, x2: x - 1, y });
                inSegment = false;
            }
        }
        if (inSegment && w - startX >= minWallLen) horizontalSegments.push({ x1: startX, x2: w - 1, y });
    }

    const verticalSegments = [];
    for (let x = step; x < w - step; x += step) {
        let inSegment = false;
        let startY = 0;
        for (let y = 0; y < h; y++) {
            const dark = isDark(x, y);
            if (dark && !inSegment) { startY = y; inSegment = true; }
            else if (!dark && inSegment) {
                if (y - startY >= minWallLen) verticalSegments.push({ y1: startY, y2: y - 1, x });
                inSegment = false;
            }
        }
        if (inSegment && h - startY >= minWallLen) verticalSegments.push({ y1: startY, y2: h - 1, x });
    }

    const mergeSegments = (segments, isHoriz) => {
        const merged = [];
        const thresholdT = 20, overlapT = 15;
        segments.forEach(seg => {
            let m = false;
            for (let ms of merged) {
                const dist = isHoriz ? Math.abs(ms.y - seg.y) : Math.abs(ms.x - seg.x);
                if (dist <= thresholdT) {
                    const overlap = isHoriz
                        ? Math.max(0, Math.min(ms.x2, seg.x2) - Math.max(ms.x1, seg.x1))
                        : Math.max(0, Math.min(ms.y2, seg.y2) - Math.max(ms.y1, seg.y1));
                    const close = isHoriz
                        ? (seg.x1 <= ms.x2 + overlapT && seg.x2 >= ms.x1 - overlapT)
                        : (seg.y1 <= ms.y2 + overlapT && seg.y2 >= ms.y1 - overlapT);
                    if (overlap > 0 || close) {
                        if (isHoriz) {
                            ms.x1 = Math.min(ms.x1, seg.x1);
                            ms.x2 = Math.max(ms.x2, seg.x2);
                            ms.y = (ms.y + seg.y) / 2;
                        } else {
                            ms.y1 = Math.min(ms.y1, seg.y1);
                            ms.y2 = Math.max(ms.y2, seg.y2);
                            ms.x = (ms.x + seg.x) / 2;
                        }
                        m = true;
                        break;
                    }
                }
            }
            if (!m) merged.push({ ...seg });
        });
        return merged;
    };

    const mergedHoriz = mergeSegments(horizontalSegments, true);
    const mergedVert = mergeSegments(verticalSegments, false);

    const scaleX = state.bgImage.width / w;
    const scaleY = state.bgImage.height / h;

    saveSnapshot();
    const newWalls = [];
    const thick = parseFloat(document.getElementById('wall-thickness').value);
    const height = parseFloat(document.getElementById('wall-height').value);
    const studSp = parseFloat(document.getElementById('stud-spacing').value);
    const minRealWallLenMm = 300;

    mergedHoriz.forEach(m => {
        const x1 = m.x1 * scaleX, x2 = m.x2 * scaleX;
        if ((x2 - x1) * state.scaleRatio >= minRealWallLenMm) {
            newWalls.push({
                id: nextId++, x1, y1: m.y * scaleY, x2, y2: m.y * scaleY,
                thickness: thick, height, studSpacing: studSp, floor: state.activeFloor
            });
        }
    });

    mergedVert.forEach(m => {
        const y1 = m.y1 * scaleY, y2 = m.y2 * scaleY;
        if ((y2 - y1) * state.scaleRatio >= minRealWallLenMm) {
            newWalls.push({
                id: nextId++, x1: m.x * scaleX, y1, x2: m.x * scaleX, y2,
                thickness: thick, height, studSpacing: studSp, floor: state.activeFloor
            });
        }
    });

    state.walls = [...state.walls, ...newWalls];
    syncTo3D();
    updateMaterialTakeoff();
    calculateRooms();
    draw2D();
    updateStatus(`도면 자동 분석이 완료되었습니다: 총 ${newWalls.length}개의 벽체가 생성되었습니다.`);
}

// ============================================================
// AI ROOM / OPENING LABELLING (Phase 3 — NVIDIA NIM VLM)
// ============================================================
async function analyzeRoomsOpenings() {
    if (!state.bgImage) {
        updateStatus('먼저 도면을 업로드해 주세요.');
        alert('먼저 도면 이미지를 업로드해 주세요.');
        return;
    }
    const activeWalls = state.walls.filter(w => (w.floor || '1') === state.activeFloor);
    if (activeWalls.length === 0) {
        updateStatus('먼저 "자동 분석"으로 벽체를 생성한 뒤 사용하세요.');
        alert('AI 방·개구부 인식은 벽체가 있어야 합니다. 먼저 "자동 분석"을 실행해 주세요.');
        return;
    }

    updateStatus('AI가 방 이름과 문·창문 위치를 인식하는 중입니다... (수 초 소요)');

    const imgW = state.bgImage.width, imgH = state.bgImage.height;
    const MAX_SEND_DIM = 2000;
    let sendW = imgW, sendH = imgH;
    const longSide = Math.max(imgW, imgH);
    if (longSide > MAX_SEND_DIM) {
        const r = MAX_SEND_DIM / longSide;
        sendW = Math.round(imgW * r);
        sendH = Math.round(imgH * r);
    }
    const c = document.createElement('canvas');
    c.width = sendW; c.height = sendH;
    c.getContext('2d').drawImage(state.bgImage, 0, 0, sendW, sendH);
    const imageDataUrl = c.toDataURL('image/jpeg', 0.85);

    try {
        const res = await fetch('/website/analyze-rooms', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: imageDataUrl, width: imgW, height: imgH })
        });
        const data = await res.json();
        if (!data || !data.ok) {
            updateStatus('AI 인식 실패: ' + ((data && data.error) || '응답 없음') + ' — 수동 편집을 이용해 주세요.');
            return;
        }

        saveSnapshot();

        // Rooms → name hints; matched to auto-detected rooms by proximity.
        state.roomLabels = (data.rooms || []).map(r => ({
            name: r.name, x: r.x, y: r.y, floor: state.activeFloor
        }));

        // Doors / windows → openings snapped onto the nearest wall.
        let added = 0;
        (data.doors || []).forEach(p => { if (addOpeningAtPoint(p, 'door')) added++; });
        (data.windows || []).forEach(p => { if (addOpeningAtPoint(p, 'window')) added++; });

        calculateRooms();
        updateMaterialTakeoff();
        draw2D();
        syncTo3D();

        const named = state.rooms.filter(r => !/^공간 \/ 방/.test(r.name)).length;
        updateStatus(`${data.message || 'AI 인식 완료'} — 개구부 ${added}개 배치, 방 이름 ${named}개 적용.`);
    } catch (err) {
        console.warn('[TimberDesigner] AI rooms API error:', err);
        updateStatus('AI 인식 중 네트워크 오류가 발생했습니다.');
    }
}

// Snap a VLM-detected point (image px = model px) onto the nearest wall and
// insert a door/window opening there. Returns true if placed.
function addOpeningAtPoint(pt, type) {
    const activeWalls = state.walls.filter(w => (w.floor || '1') === state.activeFloor);
    let best = null, bestD = Infinity, bestT = 0;
    activeWalls.forEach(w => {
        const dx = w.x2 - w.x1, dy = w.y2 - w.y1;
        const len2 = dx * dx + dy * dy;
        if (len2 === 0) return;
        let t = ((pt.x - w.x1) * dx + (pt.y - w.y1) * dy) / len2;
        t = Math.max(0, Math.min(1, t));
        const px = w.x1 + t * dx, py = w.y1 + t * dy;
        const d = Math.hypot(pt.x - px, pt.y - py);
        if (d < bestD) { bestD = d; best = w; bestT = t; }
    });
    if (!best) return false;

    // Reject points that are not near any wall (likely mislocated by the VLM).
    if (bestD * state.scaleRatio > 1500) return false;

    const wallLenMm = Math.hypot(best.x2 - best.x1, best.y2 - best.y1) * state.scaleRatio;
    const width = type === 'door' ? 900 : 1200;
    if (wallLenMm < width * 1.2) return false; // wall too short for this opening

    let distanceMm = bestT * wallLenMm;
    const margin = width / 2 + 50;
    distanceMm = Math.max(margin, Math.min(wallLenMm - margin, distanceMm));

    state.openings.push({
        id: nextId++,
        wallId: best.id,
        distance: distanceMm,
        width: width,
        height: type === 'door' ? 2100 : 1200,
        sillHeight: type === 'window' ? 900 : 0,
        type: type
    });
    return true;
}

// ============================================================
// FILE UPLOAD (Image & PDF)
// ============================================================
function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    updateStatus('도면 파일을 읽는 중입니다...');

    const reader = new FileReader();

    if (file.type === 'application/pdf') {
        reader.onload = function() {
            const typedarray = new Uint8Array(this.result);
            pdfjsLib.getDocument(typedarray).promise.then(pdf => {
                pdf.getPage(1).then(page => {
                    const viewport = page.getViewport({ scale: 2.0 });
                    const tempCanvas = document.createElement('canvas');
                    const tempCtx = tempCanvas.getContext('2d');
                    tempCanvas.width = viewport.width;
                    tempCanvas.height = viewport.height;

                    const renderContext = {
                        canvasContext: tempCtx,
                        viewport: viewport
                    };
                    
                    page.render(renderContext).promise.then(() => {
                        const img = new Image();
                        img.src = tempCanvas.toDataURL();
                        img.onload = function() {
                            state.bgImage = img;
                            resizeCanvas(img.width, img.height);
                            
                            const mainViewport = document.getElementById('canvas-viewport');
                            state.zoomScale = Math.min(mainViewport.clientWidth / img.width, mainViewport.clientHeight / img.height, 1.0);
                            state.panX = (mainViewport.clientWidth - img.width * state.zoomScale) / 2;
                            state.panY = (mainViewport.clientHeight - img.height * state.zoomScale) / 2;
                            applyCanvasTransformations();

                            updateStatus('PDF 도면이 정상 업로드되었습니다. 척도를 먼저 보정하세요.');
                        };
                    });
                });
            }).catch(err => {
                console.error(err);
                updateStatus('PDF 파싱에 실패했습니다.');
            });
        };
        reader.readAsArrayBuffer(file);
    } else {
        reader.onload = function(event) {
            const img = new Image();
            img.src = event.target.result;
            img.onload = function() {
                state.bgImage = img;
                resizeCanvas(img.width, img.height);
                
                const mainViewport = document.getElementById('canvas-viewport');
                state.zoomScale = Math.min(mainViewport.clientWidth / img.width, mainViewport.clientHeight / img.height, 1.0);
                state.panX = (mainViewport.clientWidth - img.width * state.zoomScale) / 2;
                state.panY = (mainViewport.clientHeight - img.height * state.zoomScale) / 2;
                applyCanvasTransformations();

                updateStatus('이미지 도면이 성공적으로 로드되었습니다. 척도를 먼저 보정해 주십시오.');
            };
        };
        reader.readAsDataURL(file);
    }
}

// ============================================================
// RESET / CLEAR PROJECT
// ============================================================
function clearProject() {
    if (confirm('모든 도면 작업 내용이 초기화됩니다. 계속하시겠습니까?')) {
        state.walls = [];
        state.posts = [];
        state.openings = [];
        state.guides = [];
        state.rooms = [];
        state.activeFloor = '1';
        state.bgImage = null;
        state.scaleSet = false;
        state.scaleRatio = 1.0;
        nextId = 1;

        const floorSelect = document.getElementById('floor-select');
        if (floorSelect) floorSelect.value = '1';

        document.getElementById('scale-status').textContent = '척도 미설정 (1px = 1px)';
        document.getElementById('scale-status').classList.remove('active');
        document.getElementById('blueprint-upload').value = '';

        selectElement(null);
        resizeCanvas(2000, 1500);

        // Reset Pan & Zoom
        state.zoomScale = 1.0;
        state.panX = 0;
        state.panY = 0;
        applyCanvasTransformations();

        syncTo3D();
        updateMaterialTakeoff();
        calculateRooms();
        draw2D();
        updateStatus('모든 데이터가 청소되었습니다.');
    }
}

function syncTo3D() {
    const showSheathing = document.getElementById('chk-show-sheathing').checked;
    renderScene3D(
        state.walls,
        state.posts,
        state.openings,
        showSheathing,
        state.scaleRatio,
        state.layers,
        state.roofConfig,
        state.foundation,
        state.joistConfig
    );
}



function centerView(imgW, imgH) {
    const mainViewport = document.getElementById('canvas-viewport');
    state.zoomScale = Math.min(mainViewport.clientWidth / imgW, mainViewport.clientHeight / imgH, 1.0);
    state.panX = (mainViewport.clientWidth - imgW * state.zoomScale) / 2;
    state.panY = (mainViewport.clientHeight - imgH * state.zoomScale) / 2;
    applyCanvasTransformations();
}

function updateStatus(msg) {
    const statusMsg = document.getElementById('status-msg');
    if (statusMsg) statusMsg.textContent = msg;
}

function resizeCanvas(w, h) {
    canvas.width = w;
    canvas.height = h;
    state.bgWidth = w;
    state.bgHeight = h;
    draw2D();
}

// ============================================================
// PHASE 3 ADDED FUNCTIONS
// ============================================================

// Calculate estimated rafter count based on top-floor building dimensions
function calculateRaftersCount() {
    if (!state.roofConfig || state.roofConfig.type === 'none' || state.walls.length === 0) return 0;
    
    let highestFloor = '1';
    state.walls.forEach(w => {
        const f = w.floor || '1';
        if (f > highestFloor) highestFloor = f;
    });
    const topWalls = state.walls.filter(w => (w.floor || '1') === highestFloor);
    if (topWalls.length === 0) return 0;
    
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    topWalls.forEach(w => {
        minX = Math.min(minX, w.x1, w.x2);
        maxX = Math.max(maxX, w.x1, w.x2);
        minY = Math.min(minY, w.y1, w.y2);
        maxY = Math.max(maxY, w.y1, w.y2);
    });
    
    const overhang = parseFloat(state.roofConfig.overhang || 600);
    const rafterSpacing = parseFloat(state.roofConfig.rafterSpacing || 400);
    const xSpan = (maxX - minX) * state.scaleRatio;
    const ySpan = (maxY - minY) * state.scaleRatio;
    
    const isRidgeAlongX = xSpan >= ySpan;
    const ridgeLen = isRidgeAlongX ? xSpan + overhang * 2 : ySpan + overhang * 2;
    const pairs = Math.floor(ridgeLen / rafterSpacing) + 1;
    
    if (state.roofConfig.type === 'shed') {
        return pairs;
    }
    return pairs * 2;
}

// Generate roof configuration
function generateRoofFromWalls() {
    saveSnapshot();
    state.roofConfig.type = document.getElementById('roof-type').value;
    state.roofConfig.pitch = parseFloat(document.getElementById('roof-pitch').value);
    state.roofConfig.overhang = parseFloat(document.getElementById('roof-overhang').value);
    state.roofConfig.rafterSpacing = parseFloat(document.getElementById('rafter-spacing').value);
    
    updateMaterialTakeoff();
    syncTo3D();
    draw2D();
    updateStatus('지붕 정보가 성공적으로 반영되었습니다.');
}

// Draw 2D Roof Outline as dashed guidelines
function draw2DRoofOutline() {
    if (!state.layers.roof || !state.roofConfig || state.roofConfig.type === 'none') return;
    
    let highestFloor = '1';
    state.walls.forEach(w => {
        const f = w.floor || '1';
        if (f > highestFloor) highestFloor = f;
    });
    
    const topWalls = state.walls.filter(w => (w.floor || '1') === highestFloor);
    if (topWalls.length === 0) return;
    
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    topWalls.forEach(w => {
        minX = Math.min(minX, w.x1, w.x2);
        maxX = Math.max(maxX, w.x1, w.x2);
        minY = Math.min(minY, w.y1, w.y2);
        maxY = Math.max(maxY, w.y1, w.y2);
    });
    
    const overhang = parseFloat(state.roofConfig.overhang || 600) / state.scaleRatio;
    
    const rMinX = minX - overhang;
    const rMaxX = maxX + overhang;
    const rMinY = minY - overhang;
    const rMaxY = maxY + overhang;
    
    ctx.save();
    ctx.strokeStyle = '#3498db';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 5]);
    ctx.strokeRect(rMinX, rMinY, rMaxX - rMinX, rMaxY - rMinY);
    
    const xSpan = rMaxX - rMinX;
    const ySpan = rMaxY - rMinY;
    const midX = (rMinX + rMaxX) / 2;
    const midY = (rMinY + rMaxY) / 2;
    
    if (state.roofConfig.type === 'gable' || state.roofConfig.type === 'hip') {
        if (xSpan >= ySpan) {
            if (state.roofConfig.type === 'gable') {
                ctx.beginPath();
                ctx.moveTo(rMinX, midY);
                ctx.lineTo(rMaxX, midY);
                ctx.stroke();
            } else {
                const indent = ySpan / 2;
                ctx.beginPath();
                ctx.moveTo(rMinX + indent, midY);
                ctx.lineTo(rMaxX - indent, midY);
                ctx.stroke();
                
                ctx.beginPath();
                ctx.moveTo(rMinX, rMinY); ctx.lineTo(rMinX + indent, midY);
                ctx.moveTo(rMinX, rMaxY); ctx.lineTo(rMinX + indent, midY);
                ctx.moveTo(rMaxX, rMinY); ctx.lineTo(rMaxX - indent, midY);
                ctx.moveTo(rMaxX, rMaxY); ctx.lineTo(rMaxX - indent, midY);
                ctx.stroke();
            }
        } else {
            if (state.roofConfig.type === 'gable') {
                ctx.beginPath();
                ctx.moveTo(midX, rMinY);
                ctx.lineTo(midX, rMaxY);
                ctx.stroke();
            } else {
                const indent = xSpan / 2;
                ctx.beginPath();
                ctx.moveTo(midX, rMinY + indent);
                ctx.lineTo(midX, rMaxY - indent);
                ctx.stroke();
                
                ctx.beginPath();
                ctx.moveTo(rMinX, rMinY); ctx.lineTo(midX, rMinY + indent);
                ctx.moveTo(rMaxX, rMinY); ctx.lineTo(midX, rMinY + indent);
                ctx.moveTo(rMinX, rMaxY); ctx.lineTo(midX, rMaxY - indent);
                ctx.moveTo(rMaxX, rMaxY); ctx.lineTo(midX, rMaxY - indent);
                ctx.stroke();
            }
        }
    }
    
    ctx.fillStyle = '#3498db';
    ctx.font = '10px sans-serif';
    ctx.fillText(`${state.roofConfig.type.toUpperCase()} ROOF`, rMinX + 5, rMinY - 5);
    ctx.restore();
}

// Draw 2D concrete foundation outlines
function draw2DFoundation() {
    if (!state.layers.foundation || state.activeFloor !== '1') return;
    const f1Walls = state.walls.filter(w => (w.floor || '1') === '1');
    
    ctx.save();
    ctx.strokeStyle = 'rgba(108, 117, 125, 0.4)';
    f1Walls.forEach(wall => {
        ctx.lineWidth = wall.thickness / state.scaleRatio + 10;
        ctx.beginPath();
        ctx.moveTo(wall.x1, wall.y1);
        ctx.lineTo(wall.x2, wall.y2);
        ctx.stroke();
    });
    ctx.restore();
}

// Draw 2D structural floor joists layout
function draw2DJoists() {
    if (!state.layers.joists) return;
    const activeWalls = state.walls.filter(w => (w.floor || '1') === state.activeFloor);
    if (activeWalls.length === 0) return;
    
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    activeWalls.forEach(w => {
        minX = Math.min(minX, w.x1, w.x2);
        maxX = Math.max(maxX, w.x1, w.x2);
        minY = Math.min(minY, w.y1, w.y2);
        maxY = Math.max(maxY, w.y1, w.y2);
    });
    
    if (minX === Infinity) return;
    
    const spacingPx = 400 / state.scaleRatio;
    
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 165, 0, 0.25)';
    ctx.lineWidth = 1;
    
    const w = maxX - minX;
    const h = maxY - minY;
    
    if (w >= h) {
        for (let x = minX + spacingPx; x < maxX; x += spacingPx) {
            ctx.beginPath();
            ctx.moveTo(x, minY);
            ctx.lineTo(x, maxY);
            ctx.stroke();
        }
    } else {
        for (let y = minY + spacingPx; y < maxY; y += spacingPx) {
            ctx.beginPath();
            ctx.moveTo(minX, y);
            ctx.lineTo(maxX, y);
            ctx.stroke();
        }
    }
    ctx.restore();
}

// Draw 2D user-defined dimension annotations
function draw2DAnnotations() {
    if (!state.layers.annotations || !state.annotations) return;
    const activeAnn = state.annotations.filter(a => (a.floor || '1') === state.activeFloor);
    
    ctx.save();
    ctx.strokeStyle = '#e74c3c';
    ctx.fillStyle = '#e74c3c';
    ctx.lineWidth = 1.5;
    ctx.font = '12px sans-serif';
    
    activeAnn.forEach(ann => {
        ctx.beginPath();
        ctx.moveTo(ann.x1, ann.y1);
        ctx.lineTo(ann.x2, ann.y2);
        ctx.stroke();
        
        drawTicks(ann.x1, ann.y1, ann.x2, ann.y2);
        
        const midX = (ann.x1 + ann.x2) / 2;
        const midY = (ann.y1 + ann.y2) / 2;
        ctx.fillText(ann.text, midX, midY - 5);
    });
    ctx.restore();
}

// Draw tick marks at the ends of dimension lines
function drawTicks(x1, y1, x2, y2) {
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const tickLen = 6;
    
    ctx.beginPath();
    ctx.moveTo(x1 - Math.cos(angle + Math.PI/2) * tickLen, y1 - Math.sin(angle + Math.PI/2) * tickLen);
    ctx.lineTo(x1 + Math.cos(angle + Math.PI/2) * tickLen, y1 + Math.sin(angle + Math.PI/2) * tickLen);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(x2 - Math.cos(angle + Math.PI/2) * tickLen, y2 - Math.sin(angle + Math.PI/2) * tickLen);
    ctx.lineTo(x2 + Math.cos(angle + Math.PI/2) * tickLen, y2 + Math.sin(angle + Math.PI/2) * tickLen);
    ctx.stroke();
}

// Draw dynamic dimension line preview while dragging
function drawDimensionPreview(previewPoint) {
    if (!state.annotationStart || !previewPoint) return;
    ctx.save();
    ctx.strokeStyle = '#e74c3c';
    ctx.fillStyle = '#e74c3c';
    ctx.lineWidth = 1.5;
    ctx.font = '12px sans-serif';
    
    ctx.beginPath();
    ctx.moveTo(state.annotationStart.x, state.annotationStart.y);
    ctx.lineTo(previewPoint.x, previewPoint.y);
    ctx.stroke();
    
    drawTicks(state.annotationStart.x, state.annotationStart.y, previewPoint.x, previewPoint.y);
    
    const distMm = Math.round(distance(state.annotationStart, previewPoint) * state.scaleRatio);
    const midX = (state.annotationStart.x + previewPoint.x) / 2;
    const midY = (state.annotationStart.y + previewPoint.y) / 2;
    ctx.fillText(`${distMm} mm`, midX, midY - 5);
    ctx.restore();
}

// Generate the Bill of Materials dataset
function generateBOMData() {
    let totalWallLenMm = 0;
    let totalStuds = 0;
    let totalPlatesLenMm = 0;
    let f1WallLenMm = 0;
    const LUMBER_T = 38;

    state.walls.forEach(wall => {
        const dx = wall.x2 - wall.x1;
        const dy = wall.y2 - wall.y1;
        const wallLenMm = Math.sqrt(dx * dx + dy * dy) * state.scaleRatio;

        totalWallLenMm += wallLenMm;
        if ((wall.floor || '1') === '1') {
            f1WallLenMm += wallLenMm;
        }
        let wallPlatesMm = wallLenMm * 3;

        const wallOps = state.openings.filter(o => o.wallId === wall.id);
        wallOps.forEach(op => {
            if (op.type === 'door') {
                wallPlatesMm -= op.width;
            }
        });
        totalPlatesLenMm += wallPlatesMm;

        let wallStuds = 0;
        let regularStudCoords = [];
        for (let x = 0; x <= wallLenMm; x += wall.studSpacing) {
            regularStudCoords.push(x);
        }
        if (regularStudCoords[regularStudCoords.length - 1] !== wallLenMm) {
            regularStudCoords.push(wallLenMm);
        }

        const ranges = wallOps.map(op => {
            const oStart = op.distance - op.width / 2;
            const oEnd = op.distance + op.width / 2;
            wallStuds += 4;
            if (op.type === 'window' && op.sillHeight > LUMBER_T) {
                for (let cx = oStart + wall.studSpacing - (oStart % wall.studSpacing); cx < oEnd; cx += wall.studSpacing) {
                    wallStuds += 1;
                }
            }
            for (let cx = oStart; cx <= oEnd; cx += wall.studSpacing) {
                if (cx >= oStart + LUMBER_T && cx <= oEnd - LUMBER_T) {
                    wallStuds += 1;
                }
            }
            return { start: oStart - LUMBER_T, end: oEnd + LUMBER_T };
        });

        regularStudCoords.forEach(x => {
            const isInside = ranges.some(r => x > r.start && x < r.end);
            if (!isInside) wallStuds += 1;
        });

        totalStuds += wallStuds;
    });

    const totalRafters = calculateRaftersCount();
    const totalPosts = state.posts.length;
    const concreteVolumeM3 = (f1WallLenMm / 1000) * 0.4 * 0.6;

    const data = [
        {
            name: "스터드 (Studs - 2x6)",
            spec: "38x140mm 구조재 (L=2400)",
            qty: totalStuds,
            unit: "개",
            unitPrice: state.unitPrices.stud,
            totalPrice: totalStuds * state.unitPrices.stud
        },
        {
            name: "깔도리 (Plates)",
            spec: "38x140mm 구조재 (길이합산)",
            qty: parseFloat((totalPlatesLenMm / 1000).toFixed(1)),
            unit: "m",
            unitPrice: state.unitPrices.plate,
            totalPrice: Math.round((totalPlatesLenMm / 1000) * state.unitPrices.plate)
        },
        {
            name: "기둥 (Posts)",
            spec: "140x140mm 집성목재 (L=2400)",
            qty: totalPosts,
            unit: "개",
            unitPrice: state.unitPrices.post,
            totalPrice: totalPosts * state.unitPrices.post
        },
        {
            name: "서까래 (Rafters)",
            spec: "38x184mm 서까래 구조재",
            qty: totalRafters,
            unit: "개",
            unitPrice: state.unitPrices.rafter,
            totalPrice: totalRafters * state.unitPrices.rafter
        },
        {
            name: "기초용 레미콘 콘크리트",
            spec: "줄기초 규격 (400x600)",
            qty: parseFloat(concreteVolumeM3.toFixed(2)),
            unit: "m³",
            unitPrice: state.unitPrices.concrete,
            totalPrice: Math.round(concreteVolumeM3 * state.unitPrices.concrete)
        }
    ];

    return data;
}

// Display Bill of Materials modal dialog
function showBOMModal() {
    const items = generateBOMData();
    const tbody = document.getElementById('bom-tbody');
    tbody.innerHTML = '';
    let grandTotal = 0;
    
    items.forEach(item => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${item.name}</td>
            <td>${item.spec}</td>
            <td>${item.qty}</td>
            <td>${item.unit}</td>
            <td>₩${item.unitPrice.toLocaleString()}</td>
            <td>₩${item.totalPrice.toLocaleString()}</td>
        `;
        tbody.appendChild(row);
        grandTotal += item.totalPrice;
    });
    
    document.getElementById('bom-total').textContent = `₩${grandTotal.toLocaleString()}`;
    document.getElementById('bom-modal').style.display = 'flex';
}

// Generate and download a PDF Estimation Report using jsPDF
function generatePDFReport() {
    if (!window.jspdf) {
        alert("jsPDF 라이브러리가 로드되지 않았습니다. 다시 시도해 주세요.");
        return;
    }
    updateStatus("PDF 보고서를 생성 중입니다...");

    // Create temporary high-resolution canvas for A4 page (150 DPI)
    const reportCanvas = document.createElement('canvas');
    reportCanvas.width = 1240;
    reportCanvas.height = 1754;
    const rCtx = reportCanvas.getContext('2d');

    // Draw white background
    rCtx.fillStyle = '#ffffff';
    rCtx.fillRect(0, 0, reportCanvas.width, reportCanvas.height);

    // Draw Dark Blue Header Banner
    rCtx.fillStyle = '#212529';
    rCtx.fillRect(0, 0, reportCanvas.width, 240);

    // Draw Title
    rCtx.fillStyle = '#ffffff';
    rCtx.font = 'bold 36px "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
    rCtx.fillText('목조주택 골조 물량 산출 보고서', 60, 100);

    rCtx.fillStyle = '#b8c2cc';
    rCtx.font = '20px sans-serif';
    rCtx.fillText(`TIMBER HOUSE ESTIMATION REPORT   |   발행일: ${new Date().toLocaleString()}`, 60, 160);

    // Define helper to draw sections
    let currentY = 320;

    const drawSectionTitle = (titleText) => {
        rCtx.fillStyle = '#212529';
        rCtx.font = 'bold 24px "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
        rCtx.fillText(titleText, 60, currentY);

        rCtx.strokeStyle = '#dee2e6';
        rCtx.lineWidth = 2;
        rCtx.beginPath();
        rCtx.moveTo(60, currentY + 15);
        rCtx.lineTo(1180, currentY + 15);
        rCtx.stroke();

        currentY += 50;
    };

    // Section 1: 프로젝트 요약
    drawSectionTitle('1. 프로젝트 요약');

    let totalWallLenMm = 0;
    state.walls.forEach(w => {
        const dx = w.x2 - w.x1;
        const dy = w.y2 - w.y1;
        totalWallLenMm += Math.sqrt(dx * dx + dy * dy) * state.scaleRatio;
    });

    rCtx.fillStyle = '#495057';
    rCtx.font = '18px "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
    rCtx.fillText(`• 총 벽체 길이: ${(totalWallLenMm / 1000).toFixed(2)} m`, 80, currentY);
    rCtx.fillText(`• 현재 활성 층수: ${state.activeFloor}층`, 80, currentY + 35);
    rCtx.fillText(`• 총 기둥 개수: ${state.posts.length} 개`, 80, currentY + 70);

    currentY += 120;

    // Section 2: 상세 자재 명세 (BOM)
    drawSectionTitle('2. 자재 물량 산출표 (BOM)');

    // Table Header
    rCtx.fillStyle = '#f8f9fa';
    rCtx.fillRect(60, currentY, 1120, 45);

    rCtx.fillStyle = '#495057';
    rCtx.font = 'bold 18px "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
    rCtx.fillText('자재명', 80, currentY + 28);
    rCtx.fillText('규격 및 사양', 320, currentY + 28);
    rCtx.fillText('수량', 850, currentY + 28);
    rCtx.fillText('단위', 1050, currentY + 28);

    rCtx.strokeStyle = '#dee2e6';
    rCtx.lineWidth = 1;
    rCtx.beginPath();
    rCtx.moveTo(60, currentY + 45);
    rCtx.lineTo(1180, currentY + 45);
    rCtx.stroke();

    currentY += 45;

    // Table Rows
    const bomData = generateBOMData();
    rCtx.font = '18px "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';

    bomData.forEach(item => {
        rCtx.fillStyle = '#212529';
        rCtx.fillText(item.name, 80, currentY + 30);
        rCtx.fillStyle = '#6c757d';
        rCtx.fillText(item.spec, 320, currentY + 30);
        rCtx.fillStyle = '#212529';
        rCtx.fillText(item.qty.toString(), 850, currentY + 30);
        rCtx.fillText(item.unit, 1050, currentY + 30);

        rCtx.strokeStyle = '#e9ecef';
        rCtx.beginPath();
        rCtx.moveTo(60, currentY + 45);
        rCtx.lineTo(1180, currentY + 45);
        rCtx.stroke();

        currentY += 45;
    });

    currentY += 40;

    // Section 3: 공간 면적 현황
    if (state.rooms.length > 0) {
        drawSectionTitle('3. 공간(방) 면적 현황');

        // Table Header
        rCtx.fillStyle = '#f8f9fa';
        rCtx.fillRect(60, currentY, 1120, 45);
        rCtx.fillStyle = '#495057';
        rCtx.font = 'bold 18px "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
        rCtx.fillText('공간명', 80, currentY + 28);
        rCtx.fillText('면적 (㎡)', 500, currentY + 28);
        rCtx.fillText('평수 (평)', 850, currentY + 28);

        rCtx.strokeStyle = '#dee2e6';
        rCtx.beginPath();
        rCtx.moveTo(60, currentY + 45);
        rCtx.lineTo(1180, currentY + 45);
        rCtx.stroke();

        currentY += 45;

        rCtx.font = '18px "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
        state.rooms.forEach(room => {
            rCtx.fillStyle = '#212529';
            rCtx.fillText(room.name, 80, currentY + 30);
            rCtx.fillText(`${room.areaM2.toFixed(2)} ㎡`, 500, currentY + 30);
            rCtx.fillText(`${room.pyeong.toFixed(2)} 평`, 850, currentY + 30);

            rCtx.strokeStyle = '#e9ecef';
            rCtx.beginPath();
            rCtx.moveTo(60, currentY + 45);
            rCtx.lineTo(1180, currentY + 45);
            rCtx.stroke();

            currentY += 45;
        });
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');

    // Page 1: Report layout image
    const reportImgData = reportCanvas.toDataURL('image/jpeg', 0.95);
    doc.addImage(reportImgData, 'JPEG', 0, 0, 210, 297);

    // Page 2: Visual Plans (2D and 3D)
    doc.addPage();

    // Dark Header Banner for Page 2
    doc.setFillColor(33, 37, 41);
    doc.rect(0, 0, 220, 30, "F");

    // Let's create a temporary canvas to draw Korean text labels for the images
    const labelCanvas = document.createElement('canvas');
    labelCanvas.width = 1200;
    labelCanvas.height = 100;
    const lCtx = labelCanvas.getContext('2d');
    
    lCtx.fillStyle = '#212529';
    lCtx.fillRect(0, 0, 1200, 100);
    lCtx.fillStyle = '#ffffff';
    lCtx.font = 'bold 28px "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
    lCtx.fillText("TIMBER HOUSE VISUAL ATTACHMENTS (시각 도면 첨부)", 40, 60);
    const p2HeaderData = labelCanvas.toDataURL('image/png');
    doc.addImage(p2HeaderData, "PNG", 0, 0, 210, 17.5);

    // 2D Label
    lCtx.clearRect(0,0,1200,100);
    lCtx.fillStyle = '#ffffff';
    lCtx.fillRect(0,0,1200,100);
    lCtx.fillStyle = '#212529';
    lCtx.font = 'bold 28px "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
    lCtx.fillText("첨부 1: 2D 구조 평면도 (2D Floor Plan Layout)", 40, 60);
    const label2DData = labelCanvas.toDataURL('image/png');

    // 3D Label
    lCtx.clearRect(0,0,1200,100);
    lCtx.fillStyle = '#ffffff';
    lCtx.fillRect(0,0,1200,100);
    lCtx.fillStyle = '#212529';
    lCtx.font = 'bold 28px "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
    lCtx.fillText("첨부 2: 3D 목조 골조 입체 뷰 (3D Framing Perspective)", 40, 60);
    const label3DData = labelCanvas.toDataURL('image/png');

    // Render 2D Layout
    try {
        const imgData2D = canvas.toDataURL("image/png");
        doc.addImage(label2DData, "PNG", 15, 28, 180, 15);
        doc.addImage(imgData2D, "PNG", 20, 45, 170, 100);
    } catch (e) {
        console.error("2D screenshot failed:", e);
    }

    // Render 3D Layout
    if (renderer) {
        try {
            const imgData3D = renderer.domElement.toDataURL("image/png");
            doc.addImage(label3DData, "PNG", 15, 153, 180, 15);
            doc.addImage(imgData3D, "PNG", 20, 170, 170, 100);
        } catch (e) {
            console.error("3D screenshot failed:", e);
        }
    }

    doc.save("timber-designer-report.pdf");
    updateStatus("PDF 보고서가 한글이 완벽히 지원되는 형태로 저장되었습니다.");
}





