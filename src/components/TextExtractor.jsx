import { useEffect, useRef, useState } from "react";

export default function TextExtractor({ workspacePath, currentLanguage, currentImageName, currentImagePath, currentImageUrl, onTabChange, currentTab, onOpenImage }) {
  const [languages, setLanguages] = useState([]);
  const [selectedLanguage, setSelectedLanguage] = useState(currentLanguage || "");
  const [extractedLines, setExtractedLines] = useState([]);
  const [searchText, setSearchText] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [selectedResult, setSelectedResult] = useState(null);
  const [status, setStatus] = useState("Select a language to start");
  const [isLoading, setIsLoading] = useState(false);
  const [resultPage, setResultPage] = useState(0); // For pagination
  const [drawMode, setDrawMode] = useState(false);
  const [markers, setMarkers] = useState([]);
  const [draftMarker, setDraftMarker] = useState(null);
  const [isDrawingMarker, setIsDrawingMarker] = useState(false);
  const [imageDimensions, setImageDimensions] = useState({ w: 1, h: 1 });
  const imageContainerRef = useRef(null);
  const imageRef = useRef(null);

  const RESULTS_PER_PAGE = 10;
  const totalPages = Math.ceil(searchResults.length / RESULTS_PER_PAGE);
  const paginatedResults = searchResults.slice(resultPage * RESULTS_PER_PAGE, (resultPage + 1) * RESULTS_PER_PAGE);

  // Form fields for creating a record
  const [formData, setFormData] = useState({
    language: "",
    textId: "",
    englishTranslation: "",
    localLanguageTranslation: "",
    comment: "",
    imageName: currentImageName || ""
  });

  // Load available languages on mount and restore saved state
  useEffect(() => {
    loadAvailableLanguages();
    restoreState();
  }, []);

  // Update selectedLanguage when currentLanguage changes
  useEffect(() => {
    if (currentLanguage && languages.includes(currentLanguage)) {
      setSelectedLanguage(currentLanguage);
    }
  }, [currentLanguage, languages]);

  // Update imageName in form when currentImageName changes
  useEffect(() => {
    setFormData((prev) => ({
      ...prev,
      imageName: currentImageName || ""
    }));
  }, [currentImageName]);

  useEffect(() => {
    if (!currentImageUrl) {
      setImageDimensions({ w: 1, h: 1 });
      setMarkers([]);
      setDraftMarker(null);
      setIsDrawingMarker(false);
      return;
    }

    const img = new Image();
    img.onload = () => {
      setImageDimensions({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 });
      setMarkers([]);
      setDraftMarker(null);
      setIsDrawingMarker(false);
    };
    img.src = currentImageUrl;
  }, [currentImageUrl]);

  async function loadAvailableLanguages() {
    try {
      setIsLoading(true);
      const langs = await window.worklessApi.getAvailableLanguagesText(workspacePath);
      setLanguages(langs);
      if (langs.length > 0) {
        const langToSelect = currentLanguage && langs.includes(currentLanguage) ? currentLanguage : langs[0];
        setSelectedLanguage(langToSelect);
      }
      setStatus("Languages loaded successfully");
    } catch (error) {
      setStatus(`Failed to load languages: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  }

  function saveState() {
    const state = {
      selectedLanguage,
      searchText,
      searchResults,
      selectedResult,
      extractedLines,
      formData,
      markers
    };
    localStorage.setItem("textExtractorState", JSON.stringify(state));
  }

  function restoreState() {
    try {
      const saved = localStorage.getItem("textExtractorState");
      if (saved) {
        const state = JSON.parse(saved);
        setSelectedLanguage(state.selectedLanguage || "");
        setSearchText(state.searchText || "");
        setSearchResults(state.searchResults || []);
        setSelectedResult(state.selectedResult || null);
        setExtractedLines(state.extractedLines || []);
        setFormData(state.formData || { language: "", textId: "", englishTranslation: "", localLanguageTranslation: "", comment: "", imageName: currentImageName || "" });
        setMarkers(state.markers || []);
      }
    } catch (error) {
      console.error("Failed to restore state:", error);
    }
  }

  function clampValue(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function getRelativePoint(event) {
    const rect = imageRef.current?.getBoundingClientRect();
    if (!rect) {
      return null;
    }

    const x = clampValue((event.clientX - rect.left) / rect.width, 0, 1);
    const y = clampValue((event.clientY - rect.top) / rect.height, 0, 1);
    return { x, y };
  }

  function handleImageMouseDown(event) {
    if (!drawMode || !currentImageUrl || event.button !== 0) {
      return;
    }
    const point = getRelativePoint(event);
    if (!point) {
      return;
    }
    setIsDrawingMarker(true);
    setDraftMarker({ x1: point.x, y1: point.y, x2: point.x, y2: point.y });
  }

  function handleImageMouseMove(event) {
    if (!isDrawingMarker || !draftMarker) {
      return;
    }
    const point = getRelativePoint(event);
    if (!point) {
      return;
    }
    setDraftMarker((prev) => (prev ? { ...prev, x2: point.x, y2: point.y } : prev));
  }

  function handleImageMouseUp() {
    if (!isDrawingMarker || !draftMarker) {
      setIsDrawingMarker(false);
      setDraftMarker(null);
      return;
    }

    const x1 = Math.min(draftMarker.x1, draftMarker.x2);
    const y1 = Math.min(draftMarker.y1, draftMarker.y2);
    const x2 = Math.max(draftMarker.x1, draftMarker.x2);
    const y2 = Math.max(draftMarker.y1, draftMarker.y2);

    if (x2 - x1 > 0.01 && y2 - y1 > 0.01) {
      setMarkers((prev) => [...prev, { x1, y1, x2, y2 }]);
    }

    setIsDrawingMarker(false);
    setDraftMarker(null);
  }

  async function buildAnnotatedImageUrl() {
    if (!currentImageUrl || markers.length === 0) {
      return null;
    }

    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
      image.src = currentImageUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = imageDimensions.w;
    canvas.height = imageDimensions.h;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0);
    ctx.strokeStyle = "#ff3b30";
    ctx.lineWidth = Math.max(4, Math.round(Math.min(canvas.width, canvas.height) * 0.004));

    markers.forEach((marker) => {
      const x = marker.x1 * canvas.width;
      const y = marker.y1 * canvas.height;
      const w = (marker.x2 - marker.x1) * canvas.width;
      const h = (marker.y2 - marker.y1) * canvas.height;
      ctx.strokeRect(x, y, w, h);
    });

    return canvas.toDataURL("image/png");
  }

  // Save state whenever important fields change
  useEffect(() => {
    const timer = setTimeout(saveState, 500);
    return () => clearTimeout(timer);
  }, [selectedLanguage, searchText, searchResults, selectedResult, extractedLines, formData, markers]);

  async function extractTextFromLanguage() {
    if (!selectedLanguage) {
      setStatus("Please select a language");
      return;
    }

    try {
      setIsLoading(true);
      const result = await window.worklessApi.extractTextFromLanguage(workspacePath, selectedLanguage);
      setExtractedLines(result.lines);
      setStatus(`Extracted ${result.lineCount} lines from ${selectedLanguage}`);
    } catch (error) {
      setStatus(`Failed to extract text: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  }

  async function performSearch() {
    if (!searchText.trim()) {
      setStatus("Please enter text to search");
      return;
    }

    if (!selectedLanguage) {
      setStatus("Please select a language");
      return;
    }

    try {
      setIsLoading(true);
      setSearchResults([]);
      setSelectedResult(null);
      setResultPage(0); // Reset to first page
      
      // Search only in current language
      const result = await window.worklessApi.searchTextInLanguage(workspacePath, selectedLanguage, searchText);
      setSearchResults(result);
      setStatus(`Found ${result.length} occurrences in ${selectedLanguage} language file`);
    } catch (error) {
      setStatus(`Search failed: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  }

  function selectLineAsSearchText(line) {
    setSearchText(line.text);
  }

  function loadResultIntoForm(result) {
    setSelectedResult(result);
    // Fetch English translation using the same textId
    fetchEnglishTranslation(result.textId, result, selectedLanguage);
  }

  async function fetchEnglishTranslation(textId, result, language) {
    try {
      const englishData = await window.worklessApi.getEnglishTranslation(workspacePath, textId);
      
      setFormData({
        language: language,
        textId: result.textId,
        englishTranslation: englishData.found ? englishData.translation : "",
        localLanguageTranslation: result.translation,
        comment: "",
        imageName: currentImageName || ""
      });
    } catch (error) {
      setStatus(`Failed to fetch English translation: ${error.message}`);
      setFormData({
        language: language,
        textId: result.textId,
        englishTranslation: "",
        localLanguageTranslation: result.translation,
        comment: "",
        imageName: currentImageName || ""
      });
    }
  }

  async function saveRecord() {
    if (!formData.language || !formData.textId) {
      setStatus("Language and TextID are required");
      return;
    }

    try {
      setIsLoading(true);
      const annotatedDataUrl = markers.length > 0 ? await buildAnnotatedImageUrl() : null;
      const recordToSave = {
        ...formData,
        originalText: searchText,
        position: selectedResult?.position || "",
        imagePath: currentImagePath || "",
        annotatedDataUrl
      };

      const result = await window.worklessApi.saveTextRecord(workspacePath, recordToSave);

      if (result.ok) {
        setStatus(`✅ Record saved! Total records: ${result.recordCount || "unknown"} | Image: ${formData.imageName}`);
        // Reset form but keep image name so multiple entries can be added for same image
        setFormData({
          language: selectedLanguage,
          textId: "",
          englishTranslation: "",
          localLanguageTranslation: "",
          comment: "",
          imageName: currentImageName || ""
        });
        setSelectedResult(null);
        setDraftMarker(null);
        setMarkers([]);
      } else {
        setStatus(`Failed to save record: ${result.message}`);
      }
    } catch (error) {
      setStatus(`Error saving record: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="text-extractor">
      <header className="controls">
        <div className="row tabs">
          <button
            className="tab-btn"
            onClick={() => onTabChange("images")}
            title="Go back to Image Comparison"
          >
            ← Image Comparison
          </button>
          <button
            className="tab-btn active"
            disabled
          >
            📝 Text Extraction
          </button>
          {currentImageName && (
            <span className="current-image-info">📷 Current: {currentImageName}</span>
          )}
          <span className="status-text">{status}</span>
        </div>

        <div className="row">
          <label>Language</label>
          <select
            value={selectedLanguage}
            onChange={(e) => setSelectedLanguage(e.target.value)}
            disabled={isLoading}
          >
            <option value="">-- Choose a language --</option>
            {languages.map((lang) => (
              <option key={lang} value={lang}>
                {lang}
              </option>
            ))}
          </select>
          <button onClick={extractTextFromLanguage} disabled={!selectedLanguage || isLoading}>
            Extract Text
          </button>
          <button onClick={loadAvailableLanguages} disabled={isLoading}>
            Refresh Languages
          </button>
        </div>
      </header>

      <main className="text-extraction-container">
        {/* Left panel for extracted text and search */}
        <div className="left-panel">
          <div className="section">
            <h3>📄 Extracted Lines</h3>
            <div className="text-list">
              {extractedLines.length > 0 ? (
                extractedLines.map((line) => (
                  <div
                    key={line.id}
                    className="text-line"
                    onClick={() => selectLineAsSearchText(line)}
                    title={`Click to search: ${line.textId}`}
                  >
                    <span className="line-id">{line.textId}</span>
                    <span className="line-text">{line.text}</span>
                  </div>
                ))
              ) : (
                <p className="placeholder">No text extracted. Select a language and click "Extract Text"</p>
              )}
            </div>
          </div>

          <div className="section search-section">
            <h3>🔍 Search in {selectedLanguage || "Language"}</h3>
            <div className="search-input-group">
              <textarea
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Enter text to search (click lines above or paste text)"
                rows="4"
              />
            </div>
            <button
              onClick={performSearch}
              disabled={!searchText.trim() || !selectedLanguage || isLoading}
              className="search-btn"
            >
              {isLoading ? "Searching..." : "Search"}
            </button>
          </div>
        </div>

        {/* Middle panel for search results */}
        <div className="middle-panel">
          <div className="section">
            <h3>🎯 Results ({searchResults.length}) {totalPages > 1 && `- Page ${resultPage + 1}/${totalPages}`}</h3>
            <div className="results-list">
              {searchResults.length > 0 ? (
                <>
                  {paginatedResults.map((result, idx) => (
                    <div
                      key={`${result.language}-${resultPage}-${idx}`}
                      className={`result-item ${
                        selectedResult?.position === result.position
                          ? "selected"
                          : ""
                      }`}
                      onClick={() => loadResultIntoForm(result)}
                    >
                      <div className="result-header">
                        <strong>{selectedLanguage}</strong>
                        <span className="occurrence">Match #{result.occurrence}</span>
                      </div>
                      <div className="result-context">
                        <small>Position: {result.position}</small>
                        <p>{result.context}</p>
                      </div>
                    </div>
                  ))}
                  {totalPages > 1 && (
                    <div style={{ padding: "10px", display: "flex", gap: "10px", justifyContent: "center", marginTop: "10px" }}>
                      <button
                        onClick={() => setResultPage(Math.max(0, resultPage - 1))}
                        disabled={resultPage === 0}
                        style={{ padding: "5px 10px" }}
                      >
                        ← Previous
                      </button>
                      <span style={{ alignSelf: "center", fontSize: "14px" }}>
                        {resultPage * RESULTS_PER_PAGE + 1}-{Math.min((resultPage + 1) * RESULTS_PER_PAGE, searchResults.length)} of {searchResults.length}
                      </span>
                      <button
                        onClick={() => setResultPage(Math.min(totalPages - 1, resultPage + 1))}
                        disabled={resultPage === totalPages - 1}
                        style={{ padding: "5px 10px" }}
                      >
                        Next →
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <p className="placeholder">No matches found. Try searching for text</p>
              )}
            </div>
          </div>
        </div>

        {/* Right panel for image preview and record creation */}
        <div className="right-panel">
          <div className="section image-preview-section">
            <h3>🖼️ Current Image</h3>
            {currentImageUrl ? (
              <div
                className="image-draw-container"
                ref={imageContainerRef}
                onMouseDown={(event) => {
                  if (drawMode) {
                    event.preventDefault();
                  }
                  handleImageMouseDown(event);
                }}
                onMouseMove={handleImageMouseMove}
                onMouseUp={handleImageMouseUp}
                onMouseLeave={handleImageMouseUp}
                style={{
                  position: "relative",
                  backgroundColor: "#111",
                  border: "1px solid #ccc",
                  minHeight: "250px",
                  width: "100%",
                  overflow: "hidden",
                  cursor: drawMode ? "crosshair" : "default",
                  userSelect: "none"
                }}
              >
                <img
                  ref={imageRef}
                  src={currentImageUrl}
                  alt={currentImageName || "Current image"}
                  style={{ width: "100%", height: "auto", display: "block", userSelect: "none" }}
                  draggable={false}
                  onDragStart={(event) => event.preventDefault()}
                />
                {markers.map((marker, index) => (
                  <div
                    key={`marker-${index}`}
                    style={{
                      position: "absolute",
                      left: `${Math.min(marker.x1, marker.x2) * 100}%`,
                      top: `${Math.min(marker.y1, marker.y2) * 100}%`,
                      width: `${Math.abs(marker.x2 - marker.x1) * 100}%`,
                      height: `${Math.abs(marker.y2 - marker.y1) * 100}%`,
                      border: "2px solid rgba(255, 59, 48, 0.9)",
                      boxSizing: "border-box",
                      pointerEvents: "none"
                    }}
                  />
                ))}
                {draftMarker && (
                  <div
                    style={{
                      position: "absolute",
                      left: `${Math.min(draftMarker.x1, draftMarker.x2) * 100}%`,
                      top: `${Math.min(draftMarker.y1, draftMarker.y2) * 100}%`,
                      width: `${Math.abs(draftMarker.x2 - draftMarker.x1) * 100}%`,
                      height: `${Math.abs(draftMarker.y2 - draftMarker.y1) * 100}%`,
                      border: "2px dashed rgba(255, 59, 48, 0.9)",
                      boxSizing: "border-box",
                      pointerEvents: "none"
                    }}
                  />
                )}
              </div>
            ) : (
              <p className="placeholder">No image selected. Go back to Image Comparison to choose an image.</p>
            )}
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "10px" }}>
              <button
                type="button"
                onClick={() => setDrawMode((prev) => !prev)}
                disabled={!currentImageUrl}
              >
                {drawMode ? "Stop Marking" : "Start Marking"}
              </button>
              <button
                type="button"
                onClick={() => setMarkers((prev) => prev.slice(0, -1))}
                disabled={markers.length === 0}
              >
                Undo Marker
              </button>
              <button
                type="button"
                onClick={() => setMarkers([])}
                disabled={markers.length === 0}
              >
                Clear Markers
              </button>
              {markers.length > 0 && <span>{markers.length} marker(s) added</span>}
            </div>
          </div>

          <div className="section record-form">
            <h3>📋 Create Record</h3>
            {selectedResult ? (
              <>
                <div className="form-group">
                  <label>Language</label>
                  <input
                    type="text"
                    value={formData.language}
                    disabled
                  />
                </div>

                <div className="form-group">
                  <label>Text ID *</label>
                  <input
                    type="text"
                    value={formData.textId}
                    onChange={(e) => setFormData({ ...formData, textId: e.target.value })}
                    placeholder="e.g., LANG_001"
                  />
                </div>

                <div className="form-group">
                  <label>English Translation</label>
                  <textarea
                    value={formData.englishTranslation}
                    onChange={(e) => setFormData({ ...formData, englishTranslation: e.target.value })}
                    placeholder="Enter English translation"
                    rows="2"
                  />
                </div>

                <div className="form-group">
                  <label>Local Translation</label>
                  <textarea
                    value={formData.localLanguageTranslation}
                    onChange={(e) => setFormData({ ...formData, localLanguageTranslation: e.target.value })}
                    placeholder="Local language text"
                    rows="2"
                  />
                </div>

                <div className="form-group">
                  <label>Comment / Issue</label>
                  <textarea
                    value={formData.comment}
                    onChange={(e) => setFormData({ ...formData, comment: e.target.value })}
                    placeholder="Describe the issue or note"
                    rows="2"
                  />
                </div>

                <div className="form-group">
                  <label>Image Name *</label>
                  <input
                    type="text"
                    value={formData.imageName}
                    onChange={(e) => setFormData({ ...formData, imageName: e.target.value })}
                    placeholder="Auto-filled from current comparison"
                    readOnly={!!currentImageName}
                    style={{ opacity: currentImageName ? 0.7 : 1 }}
                  />
                </div>

                <button
                  onClick={saveRecord}
                  disabled={isLoading || !formData.textId || !formData.imageName}
                  className="save-btn"
                >
                  {isLoading ? "Saving..." : "💾 Save Record"}
                </button>

                {formData.imageName && (
                  <button
                    onClick={() => onOpenImage && onOpenImage(formData.imageName)}
                    className="open-image-btn"
                    style={{ marginTop: "10px", backgroundColor: "#007bff", color: "white" }}
                  >
                    🖼️ Open in Images Tab
                  </button>
                )}
              </>
            ) : (
              <p className="placeholder">Select a search result to create a record</p>
            )}
          </div>
        </div>
      </main>

      <footer className="text-extractor-footer">
        <p>📁 Workspace: {workspacePath}</p>
        <p>📊 Records saved to: text_records.xlsx | 🌐 UTF-8 Encoding | 🗃️ Language: {selectedLanguage}</p>
      </footer>
    </div>
  );
}
