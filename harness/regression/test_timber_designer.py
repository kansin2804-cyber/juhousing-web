"""Timber House 3D Designer E2E and Resource Regression Tests."""

from __future__ import annotations

import re
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

WEB_ROOT = Path("/home/ju/ju_website")
TIMBER_DIR = WEB_ROOT / "html/timber-designer"
DESIGNER_URL = "http://127.0.0.1:8081/timber-designer/index.html"

REQUIRED_ASSETS = [
    "index.html",
    "style.css",
    "app.js",
    "renderer3d.js",
    "three.min.js",
    "OrbitControls.js",
    "GLTFExporter.js",
    "TransformControls.js",
    "pdf.min.js",
    "pdf.worker.min.js",
    "jspdf.umd.min.js",
]


def test_timber_designer_assets_exist() -> None:
    assert TIMBER_DIR.is_dir(), f"Timber Designer directory missing at: {TIMBER_DIR}"
    for asset in REQUIRED_ASSETS:
        path = TIMBER_DIR / asset
        assert path.is_file(), f"Timber Designer required asset missing: {asset}"
        assert path.stat().st_size > 0, f"Timber Designer asset is empty: {asset}"


def test_timber_designer_html_integrity() -> None:
    html_content = (TIMBER_DIR / "index.html").read_text(encoding="utf-8")
    
    # Assert that it loads local Three.js, OrbitControls, GLTFExporter and TransformControls
    assert 'src="three.min.js"' in html_content or "src='three.min.js'" in html_content
    assert 'src="OrbitControls.js"' in html_content or "src='OrbitControls.js'" in html_content
    assert 'src="GLTFExporter.js"' in html_content or "src='GLTFExporter.js'" in html_content
    assert 'src="TransformControls.js"' in html_content or "src='TransformControls.js'" in html_content
    
    # Verify presence of essential buttons including 3D GLB export
    assert 'id="btn-undo"' in html_content
    assert 'id="btn-redo"' in html_content
    assert 'id="btn-export-glb"' in html_content
    assert 'id="quality-select"' in html_content
    assert 'id="sun-select"' in html_content
    assert 'id="floor-select"' in html_content
    assert 'id="editor-canvas"' in html_content
    assert 'id="threejs-viewport"' in html_content


def test_timber_designer_headless_compilation() -> None:
    page_errors: list[str] = []

    with sync_playwright() as p:
        try:
            browser = p.chromium.launch(
                headless=True,
                args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
            )
        except Exception as exc:
            if "Executable doesn't exist" in str(exc):
                pytest.skip("Playwright chromium not installed (run: playwright install)")
            raise
        context = browser.new_context()
        page = context.new_page()
        
        # Capture JS console errors or exceptions
        page.on("pageerror", lambda err: page_errors.append(err))
        
        try:
            # Navigate to the hosted designer page
            page.goto(DESIGNER_URL, timeout=10000)
            
            # Wait for Three.js canvas to mount and script load to complete
            page.wait_for_timeout(3000)
            
            # 1. Assert no JS runtime errors occurred during bootstrap
            assert len(page_errors) == 0, f"JavaScript errors detected on page load: {page_errors}"
            
            # 2. Assert 2D sketch canvas is present
            canvas_2d = page.query_selector("canvas#editor-canvas")
            assert canvas_2d is not None, "2D Editor canvas element not found in DOM"
            
            # 3. Assert 3D WebGL canvas was successfully created by Three.js
            canvas_3d = page.query_selector("div#threejs-viewport canvas")
            assert canvas_3d is not None, "Three.js WebGL canvas was not initialized or injected inside #threejs-viewport"
            
            # 4. Assert key control elements are present and visible
            floor_select = page.query_selector("#floor-select")
            assert floor_select is not None, "Floor selector selectbox missing"
            
            tool_select = page.query_selector("#tool-select")
            assert tool_select is not None, "Selection tool button missing"
            
            btn_undo = page.query_selector("#btn-undo")
            assert btn_undo is not None, "Undo button missing"
            
        except Exception as e:
            err_msg = str(e)
            if "ERR_NAME_NOT_RESOLVED" in err_msg or "ERR_CONNECTION_REFUSED" in err_msg:
                pytest.skip("Local Nginx server is unreachable. Skipping browser-based E2E load check.")
            else:
                pytest.fail(f"Headless browser CAD load test failed: {e}")
        finally:
            browser.close()
