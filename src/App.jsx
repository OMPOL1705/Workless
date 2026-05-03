import { useEffect, useMemo, useRef, useState } from "react";
import TextExtractor from "./components/TextExtractor";

const defaultLanguagesRoot = "C:\\Users\\Om\\OneDrive\\Desktop\\Workless-main\\languages";

export default function App() {
  const [tab, setTab] = useState("images"); // "images" or "text"
  const [languagesRoot, setLanguagesRoot] = useState(defaultLanguagesRoot);
  const [languageFolders, setLanguageFolders] = useState([]);
  const [selectedLanguage, setSelectedLanguage] = useState("");
  const [innerFolders, setInnerFolders] = useState(["(All)"]);
  const [selectedInnerFolder, setSelectedInnerFolder] = useState("(All)");
  const [pairs, setPairs] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [status, setStatus] = useState("Choose language folder and click Reload.");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [drawMode, setDrawMode] = useState(false);
  const [rectangles, setRectangles] = useState([]);
  const [draftRect, setDraftRect] = useState(null);
  const [leftSize, setLeftSize] = useState({ w: 1, h: 1 });
  const [rightSize, setRightSize] = useState({ w: 1, h: 1 });
  const [isDraggingCanvas, setIsDraggingCanvas] = useState(false);
  const [isDrawingRect, setIsDrawingRect] = useState(false);
  const [imageToOpen, setImageToOpen] = useState(null); // To open specific image from text tab

  const dragPointRef = useRef({ x: 0, y: 0 });
  const leftStageRef = useRef(null);
  const rightStageRef = useRef(null);

  const currentPair = useMemo(() => pairs[currentIndex] ?? null, [pairs, currentIndex]);

  useEffect(() => {
    setRectangles([]);
    setDraftRect(null);
    setZoom(1);
    setPan({ x: 0, y: 0 });

    async function readImageSize(url, setter) {
      if (!url) {
        setter({ w: 1, h: 1 });
        return;
      }
      const img = new Image();
      img.onload = () => setter({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 });
      img.src = url;
    }

    if (currentPair) {
      readImageSize(currentPair.englishUrl, setLeftSize);
      readImageSize(currentPair.otherUrl, setRightSize);
    }
  }, [currentPair?.key]);

  // Save App state to localStorage
  useEffect(() => {
    const timer = setTimeout(() => {
      const state = {
        tab,
        languagesRoot,
        selectedLanguage,
        selectedInnerFolder,
        currentIndex,
        zoom,
        pan,
        drawMode,
        rectangles,
        draftRect
      };
      localStorage.setItem("appState", JSON.stringify(state));
    }, 500);
    return () => clearTimeout(timer);
  }, [tab, languagesRoot, selectedLanguage, selectedInnerFolder, currentIndex, zoom, pan, drawMode, rectangles, draftRect]);

  // Restore App state from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("appState");
      if (saved) {
        const state = JSON.parse(saved);
        setLanguagesRoot(state.languagesRoot || defaultLanguagesRoot);
        setSelectedLanguage(state.selectedLanguage || "");
        setSelectedInnerFolder(state.selectedInnerFolder || "(All)");
        setCurrentIndex(state.currentIndex || 0);
        setZoom(state.zoom || 1);
        setPan(state.pan || { x: 0, y: 0 });
        setDrawMode(state.drawMode || false);
        setRectangles(state.rectangles || []);
        setDraftRect(state.draftRect || null);
        if (state.tab) {
          setTab(state.tab);
        }
      }
    } catch (error) {
      console.error("Failed to restore app state:", error);
    }
  }, []);

  // Handle opening a specific image from text extraction tab
  useEffect(() => {
    if (imageToOpen) {
      setTab("images");
      // Find the image in pairs and set currentIndex
      if (pairs.length > 0) {
        const foundIndex = pairs.findIndex(p => p.key === imageToOpen);
        if (foundIndex !== -1) {
          setCurrentIndex(foundIndex);
        }
      }
      setImageToOpen(null);
    }
  }, [imageToOpen, pairs]);

  useEffect(() => {
    refreshLanguageFolders();
  }, []);

  useEffect(() => {
    if (!selectedLanguage) {
      return;
    }
    refreshInnerFolders(selectedLanguage);
  }, [selectedLanguage]);

  async function refreshLanguageFolders() {
    try {
      const info = await window.worklessApi.getLanguageOptions(languagesRoot);
      setLanguageFolders(info.languageFolders);
      if (info.languageFolders.length > 0) {
        const nextLang = info.languageFolders.includes(selectedLanguage) ? selectedLanguage : info.languageFolders[0];
        setSelectedLanguage(nextLang);
      } else {
        setSelectedLanguage("");
      }
      setInnerFolders(["(All)", ...(info.fallbackInnerFolders || [])]);
      setSelectedInnerFolder("(All)");
    } catch (error) {
      setStatus(`Failed to read languages folder: ${String(error)}`);
    }
  }

  async function refreshInnerFolders(languageName) {
    try {
      const items = await window.worklessApi.getInnerFolders(languagesRoot, languageName);
      const values = items && items.length > 0 ? items : ["(All)"];
      setInnerFolders(values);
      if (!values.includes(selectedInnerFolder)) {
        setSelectedInnerFolder(values[0]);
      }
    } catch (error) {
      setStatus(`Failed to read inner folders: ${String(error)}`);
    }
  }

  async function browseFolder() {
    const selected = await window.worklessApi.browseLanguagesRoot();
    if (!selected) {
      return;
    }
    setLanguagesRoot(selected);
    setStatus("Folder selected. Loading options...");

    try {
      const info = await window.worklessApi.getLanguageOptions(selected);
      setLanguageFolders(info.languageFolders);
      if (info.languageFolders.length > 0) {
        const nextLang = info.languageFolders[0];
        setSelectedLanguage(nextLang);
        const inner = await window.worklessApi.getInnerFolders(selected, nextLang);
        const values = inner && inner.length > 0 ? inner : ["(All)"];
        setInnerFolders(values);
        setSelectedInnerFolder(values[0]);
      } else {
        setSelectedLanguage("");
        setInnerFolders(["(All)"]);
        setSelectedInnerFolder("(All)");
      }
      setPairs([]);
      setCurrentIndex(0);
      setStatus("Select language and click Reload.");
    } catch (error) {
      setStatus(`Failed to refresh options: ${String(error)}`);
    }
  }

  async function reloadPairs() {
    if (!selectedLanguage) {
      setStatus("Please select a compare language.");
      return [];
    }

    try {
      const result = await window.worklessApi.loadPairs({
        languagesRoot,
        selectedLanguage,
        innerFolder: selectedInnerFolder
      });

      setPairs(result.pairs);
      if (result.englishCount === 0) {
        setStatus("No English images ending with _EN found.");
      } else {
        setStatus(`Loaded ${result.englishCount} English images. Missing matches show on right panel.`);
      }
      return result.pairs;
    } catch (error) {
      setStatus(`Failed to load pairs: ${String(error)}`);
      return [];
    }
  }

  function showPrevious() {
    if (pairs.length === 0) {
      return;
    }
    setCurrentIndex((prev) => Math.max(0, prev - 1));
  }

  function showNext() {
    if (pairs.length === 0) {
      return;
    }
    setCurrentIndex((prev) => Math.min(pairs.length - 1, prev + 1));
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function screenToNormalized(clientX, clientY, stageElement, imageSize) {
    if (!stageElement || !imageSize?.w || !imageSize?.h) {
      return null;
    }

    const rect = stageElement.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;

    const unscaledX = (sx - pan.x) / zoom;
    const unscaledY = (sy - pan.y) / zoom;

    const fit = Math.min(rect.width / imageSize.w, rect.height / imageSize.h);
    const drawW = imageSize.w * fit;
    const drawH = imageSize.h * fit;
    const offsetX = (rect.width - drawW) / 2;
    const offsetY = (rect.height - drawH) / 2;

    const x = (unscaledX - offsetX) / drawW;
    const y = (unscaledY - offsetY) / drawH;

    if (x < 0 || x > 1 || y < 0 || y > 1) {
      return null;
    }
    return { x, y };
  }

  function startPan(event) {
    setIsDraggingCanvas(true);
    dragPointRef.current = { x: event.clientX, y: event.clientY };
  }

  function startRightAction(event) {
    if (!currentPair?.otherUrl) {
      return;
    }
    if (!drawMode) {
      startPan(event);
      return;
    }

    const point = screenToNormalized(event.clientX, event.clientY, rightStageRef.current, rightSize);
    if (!point) {
      return;
    }

    setIsDrawingRect(true);
    setDraftRect({ x1: point.x, y1: point.y, x2: point.x, y2: point.y });
  }

  function handleMouseMove(event) {
    if (isDraggingCanvas) {
      const dx = event.clientX - dragPointRef.current.x;
      const dy = event.clientY - dragPointRef.current.y;
      dragPointRef.current = { x: event.clientX, y: event.clientY };
      setPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
    }

    if (isDrawingRect) {
      const point = screenToNormalized(event.clientX, event.clientY, rightStageRef.current, rightSize);
      if (!point) {
        return;
      }
      setDraftRect((prev) => (prev ? { ...prev, x2: point.x, y2: point.y } : prev));
    }
  }

  function handleMouseUp() {
    setIsDraggingCanvas(false);

    if (isDrawingRect && draftRect) {
      const x1 = Math.min(draftRect.x1, draftRect.x2);
      const y1 = Math.min(draftRect.y1, draftRect.y2);
      const x2 = Math.max(draftRect.x1, draftRect.x2);
      const y2 = Math.max(draftRect.y1, draftRect.y2);
      if (x2 - x1 > 0.005 && y2 - y1 > 0.005) {
        setRectangles((prev) => [...prev, { x1, y1, x2, y2 }]);
      }
    }

    setIsDrawingRect(false);
    setDraftRect(null);
  }

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  });

  function handleWheel(event) {
    event.preventDefault();
    const stage = event.currentTarget;
    const rect = stage.getBoundingClientRect();
    const mx = event.clientX - rect.left;
    const my = event.clientY - rect.top;
    const step = event.deltaY < 0 ? 1.12 : 0.89;
    const nextZoom = clamp(zoom * step, 1, 8);
    if (nextZoom === zoom) {
      return;
    }

    setPan((prev) => {
      const wx = (mx - prev.x) / zoom;
      const wy = (my - prev.y) / zoom;
      return {
        x: mx - wx * nextZoom,
        y: my - wy * nextZoom
      };
    });
    setZoom(nextZoom);
  }

  function resetView() {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }

  async function buildAnnotatedDataUrl() {
    if (!currentPair?.otherUrl) {
      return null;
    }

    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
      image.src = currentPair.otherUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0);
    ctx.strokeStyle = "#ff3b30";
    ctx.lineWidth = Math.max(2, Math.round(Math.min(canvas.width, canvas.height) * 0.004));

    rectangles.forEach((r) => {
      const x = r.x1 * canvas.width;
      const y = r.y1 * canvas.height;
      const w = (r.x2 - r.x1) * canvas.width;
      const h = (r.y2 - r.y1) * canvas.height;
      ctx.strokeRect(x, y, w, h);
    });

    return canvas.toDataURL("image/png");
  }

  async function markCurrent(decision) {
    if (!currentPair?.otherPath) {
      setStatus("No translated image in current item to move.");
      return;
    }

    const previousKey = currentPair.key;
    const previousIndex = currentIndex;

    try {
      const annotatedDataUrl = decision === "issue" && rectangles.length > 0 ? await buildAnnotatedDataUrl() : null;
      const result = await window.worklessApi.markResult({
        languagesRoot,
        selectedLanguage,
        otherPath: currentPair.otherPath,
        scriptName: currentPair.scriptName,
        decision,
        annotatedDataUrl
      });

      if (!result?.ok) {
        setStatus(result?.message || "Could not move image.");
        return;
      }

      const updatedPairs = await reloadPairs();
      let nextIndex = updatedPairs.findIndex((pair) => pair.key === previousKey);
      if (nextIndex === -1) {
        nextIndex = Math.min(previousIndex, updatedPairs.length - 1);
      }
      if (nextIndex < 0) {
        nextIndex = 0;
      }
      setCurrentIndex(nextIndex);
      setStatus(`Copied to ${decision} folder: ${result.copiedTo} | Sheet updated: ${result.reportPath}`);
    } catch (error) {
      setStatus(`Failed to copy image: ${String(error)}`);
    }
  }

  if (tab === "text") {
    // Get parent directory of languagesRoot to access languageText folder
    const workspacePath = languagesRoot.replace(/[\\\/]languages[\\\/]?$/, "");
    const fullImageName = currentPair?.otherPath
      ? currentPair.otherPath.split('\\').pop() || currentPair.otherPath.split('/').pop()
      : "";

    return (
      <TextExtractor 
        workspacePath={workspacePath}
        currentLanguage={selectedLanguage}
        currentImageName={fullImageName}
        currentImagePath={currentPair?.otherPath || ""}
        currentImageUrl={currentPair?.otherUrl || ""}
        onTabChange={setTab}
        currentTab={tab}
        onOpenImage={(imageName) => setImageToOpen(imageName)}
      />
    );
  }

  return (
    <div className="app">
      <header className="controls">
        <div className="row tabs">
          <button
            className={`tab-btn ${tab === "images" ? "active" : ""}`}
            onClick={() => setTab("images")}
          >
            Image Comparison
          </button>
          <button
            className={`tab-btn ${tab === "text" ? "active" : ""}`}
            onClick={() => setTab("text")}
          >
            Text Extraction
          </button>
        </div>

        <div className="row">
          <label>Languages folder</label>
          <input value={languagesRoot} onChange={(e) => setLanguagesRoot(e.target.value)} />
          <button onClick={browseFolder}>Browse</button>
        </div>

        <div className="row">
          <label>Compare language</label>
          <select
            value={selectedLanguage}
            onChange={(e) => {
              setSelectedLanguage(e.target.value);
            }}
          >
            {languageFolders.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>

          <label>Inner folder</label>
          <select value={selectedInnerFolder} onChange={(e) => setSelectedInnerFolder(e.target.value)}>
            {innerFolders.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>

          <button onClick={refreshLanguageFolders}>Refresh folders</button>
          <button onClick={reloadPairs}>Reload</button>
        </div>

        <div className="row nav-row">
          <button onClick={showPrevious}>Previous</button>
          <button onClick={showNext}>Next</button>
          <button className="issue-btn" onClick={() => markCurrent("issue")}>
            Issue
          </button>
          <button className="pass-btn" onClick={() => markCurrent("pass")}>
            Pass
          </button>
          <button onClick={() => setDrawMode((prev) => !prev)}>{drawMode ? "Pan Mode" : "Draw Rectangle"}</button>
          <button onClick={() => setRectangles((prev) => prev.slice(0, -1))}>Undo Rect</button>
          <button onClick={() => setRectangles([])}>Clear Rects</button>
          <button onClick={() => setZoom((z) => clamp(z * 1.2, 1, 8))}>+</button>
          <button onClick={() => setZoom((z) => clamp(z * 0.85, 1, 8))}>-</button>
          <button onClick={resetView}>Reset View</button>
          <span>Zoom: {zoom.toFixed(2)}x</span>
          <span>{status}</span>
        </div>
      </header>

      <main className="viewer">
        <section>
          <h3>English (_EN)</h3>
          <div
            ref={leftStageRef}
            className={`image-stage ${isDraggingCanvas ? "grabbing" : "grab"}`}
            onWheel={handleWheel}
            onMouseDown={startPan}
          >
            {currentPair ? (
              <div className="zoom-layer" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
                <svg className="image-svg" viewBox={`0 0 ${leftSize.w} ${leftSize.h}`} preserveAspectRatio="xMidYMid meet">
                  <image href={currentPair.englishUrl} x="0" y="0" width={leftSize.w} height={leftSize.h} />
                </svg>
              </div>
            ) : (
              <div className="placeholder">No images loaded.</div>
            )}
          </div>
        </section>
        <section>
          <h3>Selected language</h3>
          <div
            ref={rightStageRef}
            className={`image-stage ${isDraggingCanvas ? "grabbing" : drawMode ? "crosshair" : "grab"}`}
            onWheel={handleWheel}
            onMouseDown={startRightAction}
          >
            {currentPair?.otherUrl ? (
              <div className="zoom-layer" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
                <svg className="image-svg" viewBox={`0 0 ${rightSize.w} ${rightSize.h}`} preserveAspectRatio="xMidYMid meet">
                  <image href={currentPair.otherUrl} x="0" y="0" width={rightSize.w} height={rightSize.h} />
                  {rectangles.map((r, i) => (
                    <rect
                      key={`${r.x1}-${r.y1}-${i}`}
                      x={r.x1 * rightSize.w}
                      y={r.y1 * rightSize.h}
                      width={(r.x2 - r.x1) * rightSize.w}
                      height={(r.y2 - r.y1) * rightSize.h}
                      className="annot-rect"
                    />
                  ))}
                  {draftRect ? (
                    <rect
                      x={Math.min(draftRect.x1, draftRect.x2) * rightSize.w}
                      y={Math.min(draftRect.y1, draftRect.y2) * rightSize.h}
                      width={Math.abs(draftRect.x2 - draftRect.x1) * rightSize.w}
                      height={Math.abs(draftRect.y2 - draftRect.y1) * rightSize.h}
                      className="annot-rect draft"
                    />
                  ) : null}
                </svg>
              </div>
            ) : (
              <div className="placeholder">
                {currentPair ? `Missing match for key: ${currentPair.key}` : "No images loaded."}
              </div>
            )}
          </div>
        </section>
      </main>

      <footer className="footer">
        {currentPair ? (
          <>
            <div>
              Item {currentIndex + 1}/{pairs.length} | Key: {currentPair.key}
            </div>
            <div>EN: {currentPair.englishPath}</div>
            <div>Other: {currentPair.otherPath ?? "Missing"}</div>
          </>
        ) : (
          <div>Load a language to start comparison.</div>
        )}
      </footer>
    </div>
  );
}
