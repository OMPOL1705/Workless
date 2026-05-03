const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const XLSX = require("xlsx");

const ENGLISH_CODE = "EN";
const SUPPORTED_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".bmp", ".gif", ".webp"]);
const REPORT_FILE_NAME = "review_report.xlsx";
const SCRIPT_MAP_FILE_NAME = ".script_map.json";

function createWindow() {
  const win = new BrowserWindow({
    width: 1500,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const rendererUrl = process.env.ELECTRON_RENDERER_URL || "http://localhost:5173";
  win.loadURL(rendererUrl);
}

function isImage(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  return SUPPORTED_EXTENSIONS.has(ext);
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".bmp") return "image/bmp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".webp") return "image/webp";
  return "application/octet-stream";
}

function fileToDataUrl(filePath) {
  try {
    const bytes = fs.readFileSync(filePath);
    return `data:${getMimeType(filePath)};base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}

function hasUnderscoreAsThirdLast(stem) {
  return stem.length >= 3 && stem[stem.length - 3] === "_" && /^[A-Za-z]{2}$/.test(stem.slice(-2));
}

function stripLanguageSuffix(stem) {
  return stem.replace(/_[A-Za-z]{2,3}$/, "");
}

function findBestScriptDir(languageDir) {
  if (!fs.existsSync(languageDir)) {
    return languageDir;
  }

  const entries = fs
    .readdirSync(languageDir, { withFileTypes: true })
    .filter((item) => item.isDirectory() && item.name.toLowerCase().includes("script"));

  if (entries.length > 0) {
    return path.join(languageDir, entries[0].name);
  }
  return languageDir;
}

function listSubFolders(parentDir) {
  if (!fs.existsSync(parentDir)) {
    return [];
  }

  return fs
    .readdirSync(parentDir, { withFileTypes: true })
    .filter((item) => item.isDirectory())
    .map((item) => item.name)
    .sort((a, b) => a.localeCompare(b));
}

function listInnerFolders(languageDir) {
  return listSubFolders(findBestScriptDir(languageDir));
}

function collectLanguageImages(languageDir, options = {}) {
  if (!fs.existsSync(languageDir)) {
    return {};
  }

  let scanRoot = findBestScriptDir(languageDir);
  if (options.innerFolder) {
    scanRoot = path.join(scanRoot, options.innerFolder);
    if (!fs.existsSync(scanRoot)) {
      return {};
    }
  }

  const result = {};
  const stack = [scanRoot];

  while (stack.length > 0) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (!entry.isFile() || !isImage(entry.name)) {
        continue;
      }

      const stem = path.parse(entry.name).name;
      if (options.langCode) {
        const expected = `_${options.langCode.toUpperCase()}`;
        if (!stem.toUpperCase().endsWith(expected)) {
          continue;
        }
      } else if (!hasUnderscoreAsThirdLast(stem)) {
        continue;
      }

      const key = stripLanguageSuffix(stem).toLowerCase();
      result[key] = fullPath;
    }
  }

  return result;
}

function getScriptNameForImage(languageDir, imagePath) {
  const scriptRoot = findBestScriptDir(languageDir);
  const relParent = path.relative(scriptRoot, path.dirname(imagePath));
  if (!relParent || relParent === ".") {
    return "(root)";
  }
  return relParent.split(path.sep)[0];
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function getUniqueTargetPath(targetFolder, fileName) {
  const originalName = path.basename(fileName);
  let targetPath = path.join(targetFolder, originalName);

  if (fs.existsSync(targetPath)) {
    const parsed = path.parse(originalName);
    const stamp = Date.now();
    targetPath = path.join(targetFolder, `${parsed.name}_${stamp}${parsed.ext}`);
  }
  return targetPath;
}

function copyFileToFolder(sourcePath, targetFolder) {
  ensureDir(targetFolder);
  const originalName = path.basename(sourcePath);
  const targetPath = getUniqueTargetPath(targetFolder, originalName);

  fs.copyFileSync(sourcePath, targetPath);

  return targetPath;
}

function getIndexedTargetPath(targetFolder, fileName) {
  ensureDir(targetFolder);
  const parsed = path.parse(fileName);
  let targetPath = path.join(targetFolder, fileName);
  if (!fs.existsSync(targetPath)) {
    return targetPath;
  }

  let index = 1;
  while (fs.existsSync(path.join(targetFolder, `${parsed.name}_${index}${parsed.ext}`))) {
    index += 1;
  }
  return path.join(targetFolder, `${parsed.name}_${index}${parsed.ext}`);
}

function saveDataUrlToFolder(dataUrl, targetFolder, originalFilePath) {
  ensureDir(targetFolder);
  const originalName = path.basename(originalFilePath);
  const targetPath = getUniqueTargetPath(targetFolder, originalName);

  const match = /^data:(.+);base64,(.+)$/.exec(dataUrl);
  if (!match) {
    throw new Error("Invalid annotated image data");
  }

  const bytes = Buffer.from(match[2], "base64");
  fs.writeFileSync(targetPath, bytes);
  return targetPath;
}

function saveAnnotatedTextImage(dataUrl, targetFolder, originalFilePath) {
  ensureDir(targetFolder);
  const originalName = path.basename(originalFilePath);
  const targetPath = getIndexedTargetPath(targetFolder, originalName);

  const match = /^data:(.+);base64,(.+)$/.exec(dataUrl);
  if (!match) {
    throw new Error("Invalid annotated image data");
  }

  const bytes = Buffer.from(match[2], "base64");
  fs.writeFileSync(targetPath, bytes);
  return targetPath;
}

function getLanguageFolders(languagesRoot) {
  if (!fs.existsSync(languagesRoot)) {
    return [];
  }

  return listSubFolders(languagesRoot).filter((name) => {
    const low = name.toLowerCase();
    return low !== "english" && low !== "en";
  });
}

function listImageFilesFlat(folderPath) {
  if (!fs.existsSync(folderPath)) {
    return [];
  }
  return fs
    .readdirSync(folderPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && isImage(entry.name))
    .map((entry) => entry.name);
}

function scriptMapPath(baseFolder) {
  return path.join(baseFolder, SCRIPT_MAP_FILE_NAME);
}

function readScriptMap(baseFolder) {
  const file = scriptMapPath(baseFolder);
  if (!fs.existsSync(file)) {
    return {};
  }
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

function writeScriptMap(baseFolder, data) {
  ensureDir(baseFolder);
  fs.writeFileSync(scriptMapPath(baseFolder), JSON.stringify(data, null, 2), "utf8");
}

function rememberScriptForFile(baseFolder, filePath, scriptName) {
  const map = readScriptMap(baseFolder);
  map[path.basename(filePath)] = scriptName || "(unknown)";
  writeScriptMap(baseFolder, map);
}

function collectReportRows(languagesRoot) {
  const reviewRoot = path.join(languagesRoot, "language");
  if (!fs.existsSync(reviewRoot)) {
    return [];
  }

  const languageNames = listSubFolders(reviewRoot);
  const rows = [];

  for (const languageName of languageNames) {
    const issueBase = path.join(reviewRoot, languageName, "issue");
    const passBase = path.join(reviewRoot, languageName, "pass");
    const issueFiles = listImageFilesFlat(issueBase);
    const passFiles = listImageFilesFlat(passBase);
    const issueMap = readScriptMap(issueBase);
    const passMap = readScriptMap(passBase);

    const byScript = {};
    function ensureScript(scriptName) {
      if (!byScript[scriptName]) {
        byScript[scriptName] = { issue: [], pass: [] };
      }
      return byScript[scriptName];
    }

    issueFiles.forEach((name) => {
      const script = issueMap[name] || "(unknown)";
      ensureScript(script).issue.push(name);
    });

    passFiles.forEach((name) => {
      const script = passMap[name] || "(unknown)";
      ensureScript(script).pass.push(name);
    });

    Object.keys(byScript)
      .sort((a, b) => a.localeCompare(b))
      .forEach((scriptName) => {
        rows.push({
          Language: languageName,
          Script: scriptName,
          "No. of Non-Issue Screenshots": byScript[scriptName].pass.length,
          "No. of Issue Screenshots": byScript[scriptName].issue.length,
          "Issue Screenshot Names": byScript[scriptName].issue.join(", ")
        });
      });
  }

  return rows;
}

function writeReportWorkbook(languagesRoot) {
  const rows = collectReportRows(languagesRoot);
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Review Report");
  const reportPath = path.join(path.resolve(languagesRoot, ".."), REPORT_FILE_NAME);
  XLSX.writeFile(workbook, reportPath);
  return { reportPath, rowCount: rows.length };
}

ipcMain.handle("browse-languages-root", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory"]
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
});

ipcMain.handle("get-language-options", async (_event, languagesRoot) => {
  const englishDir = path.join(languagesRoot, "english");
  const languageFolders = getLanguageFolders(languagesRoot);
  const fallbackInnerFolders = listInnerFolders(englishDir);
  return {
    languageFolders,
    fallbackInnerFolders
  };
});

ipcMain.handle("get-inner-folders", async (_event, languagesRoot, selectedLanguage) => {
  const englishDir = path.join(languagesRoot, "english");
  const otherDir = path.join(languagesRoot, selectedLanguage);

  const englishFolders = new Set(listInnerFolders(englishDir));
  const otherFolders = new Set(listInnerFolders(otherDir));
  const common = [...englishFolders].filter((folder) => otherFolders.has(folder)).sort((a, b) => a.localeCompare(b));
  const englishOnly = [...englishFolders]
    .filter((folder) => !otherFolders.has(folder))
    .sort((a, b) => a.localeCompare(b));

  return ["(All)", ...common, ...englishOnly];
});

ipcMain.handle("load-pairs", async (_event, args) => {
  const { languagesRoot, selectedLanguage, innerFolder } = args;
  const chosenInnerFolder = innerFolder === "(All)" ? null : innerFolder;

  const englishDir = path.join(languagesRoot, "english");
  const otherDir = path.join(languagesRoot, selectedLanguage);

  const englishMap = collectLanguageImages(englishDir, { langCode: ENGLISH_CODE, innerFolder: chosenInnerFolder });
  const otherMap = collectLanguageImages(otherDir, { innerFolder: chosenInnerFolder });

  const keys = Object.keys(englishMap).sort((a, b) => a.localeCompare(b));
  const pairs = keys.map((key) => {
    const englishPath = englishMap[key];
    const otherPath = otherMap[key] ?? null;
    return {
      key,
      scriptName: otherPath ? getScriptNameForImage(otherDir, otherPath) : null,
      englishPath,
      otherPath,
      englishUrl: fileToDataUrl(englishPath),
      otherUrl: otherPath ? fileToDataUrl(otherPath) : null
    };
  });

  return {
    pairs,
    englishCount: keys.length
  };
});

ipcMain.handle("mark-result", async (_event, args) => {
  const { languagesRoot, selectedLanguage, otherPath, decision, annotatedDataUrl, scriptName } = args;
  if (!otherPath || !fs.existsSync(otherPath)) {
    return { ok: false, message: "Translated image not found for this item." };
  }
  if (!selectedLanguage) {
    return { ok: false, message: "Select a language first." };
  }
  if (decision !== "issue" && decision !== "pass") {
    return { ok: false, message: "Invalid decision type." };
  }

  const languageReviewRoot = path.join(languagesRoot, "language", selectedLanguage, decision);
  const copiedTo =
    decision === "issue" && annotatedDataUrl
      ? saveDataUrlToFolder(annotatedDataUrl, languageReviewRoot, otherPath)
      : copyFileToFolder(otherPath, languageReviewRoot);
  rememberScriptForFile(languageReviewRoot, copiedTo, scriptName);
  const report = writeReportWorkbook(languagesRoot);
  return { ok: true, copiedTo, reportPath: report.reportPath, rowCount: report.rowCount };
});

// ===== TEXT EXTRACTION FUNCTIONS =====
const TEXT_RECORDS_FILE_NAME = "text_records.xlsx";

function getLanguageTextFilePath(workspacePath, language) {
  return path.join(workspacePath, "languageText", `in2_${language.toLowerCase()}.txt`);
}

function readTextFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return "";
  }
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (error) {
    throw new Error(`Failed to read text file: ${error.message}`);
  }
}

function getAvailableLanguages(workspacePath) {
  const langTextPath = path.join(workspacePath, "languageText");
  if (!fs.existsSync(langTextPath)) {
    return [];
  }
  
  return fs
    .readdirSync(langTextPath)
    .filter((name) => name.startsWith("in2_") && name.endsWith(".txt"))
    .map((name) => {
      const langName = name.replace(/^in2_/, "").replace(/\.txt$/, "");
      return langName.charAt(0).toUpperCase() + langName.slice(1);
    })
    .sort();
}

function searchTextInAllLanguages(workspacePath, searchText) {
  const langTextPath = path.join(workspacePath, "languageText");
  if (!fs.existsSync(langTextPath)) {
    return [];
  }

  const results = [];
  const files = fs.readdirSync(langTextPath).filter((name) => name.startsWith("in2_") && name.endsWith(".txt"));

  files.forEach((fileName) => {
    const filePath = path.join(langTextPath, fileName);
    const langName = fileName.replace(/^in2_/, "").replace(/\.txt$/, "");
    const content = readTextFile(filePath);
    
    // Search for text (case-insensitive)
    const lowerContent = content.toLowerCase();
    const lowerSearch = searchText.toLowerCase();
    
    let startIndex = 0;
    let occurrenceIndex = 0;
    while ((startIndex = lowerContent.indexOf(lowerSearch, startIndex)) !== -1) {
      // Extract context (50 chars before and after)
      const contextStart = Math.max(0, startIndex - 50);
      const contextEnd = Math.min(content.length, startIndex + searchText.length + 50);
      const context = content.substring(contextStart, contextEnd);
      
      results.push({
        language: langName,
        fileName: fileName,
        occurrence: occurrenceIndex + 1,
        position: startIndex,
        context: context.trim(),
        extractedText: searchText
      });
      
      occurrenceIndex++;
      startIndex += searchText.length;
    }
  });

  return results;
}

function saveTextRecords(workspacePath, records) {
  const rows = records.map((record) => ({
    Language: record.language,
    TextID: record.textId || "",
    EnglishTranslation: record.englishTranslation || "",
    LocalLanguageTranslation: record.localLanguageTranslation || "",
    Comment: record.comment || "",
    ImageName: record.imageName || "",
    SavedImage: record.savedImageName || "",
    OriginalText: record.originalText || "",
    Position: record.position || ""
  }));

  const headers = [
    "Language",
    "TextID",
    "EnglishTranslation",
    "LocalLanguageTranslation",
    "Comment",
    "ImageName",
    "SavedImage",
    "OriginalText",
    "Position"
  ];

  const worksheet = XLSX.utils.json_to_sheet(rows, { header: headers });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Text Records");
  
  const reportPath = path.join(workspacePath, TEXT_RECORDS_FILE_NAME);
  XLSX.writeFile(workbook, reportPath);
  return reportPath;
}

function appendTextRecord(workspacePath, record) {
  const headers = [
    "Language",
    "TextID",
    "EnglishTranslation",
    "LocalLanguageTranslation",
    "Comment",
    "ImageName",
    "SavedImage",
    "OriginalText",
    "Position"
  ];

  const recordsFile = path.join(workspacePath, TEXT_RECORDS_FILE_NAME);
  let workbook;
  let worksheet;
  let existingRows = [];

  if (fs.existsSync(recordsFile)) {
    workbook = XLSX.readFile(recordsFile);
    if (workbook.SheetNames.includes("Text Records")) {
      worksheet = workbook.Sheets["Text Records"];
    }

    if (worksheet) {
      existingRows = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
    }
  }

  const newRow = {
    Language: record.language,
    TextID: record.textId || "",
    EnglishTranslation: record.englishTranslation || "",
    LocalLanguageTranslation: record.localLanguageTranslation || "",
    Comment: record.comment || "",
    ImageName: record.imageName || "",
    SavedImage: record.savedImageName || "",
    OriginalText: record.originalText || "",
    Position: record.position || ""
  };

  existingRows.push(newRow);

  if (!workbook) {
    workbook = XLSX.utils.book_new();
  }

  const newWorksheet = XLSX.utils.json_to_sheet(existingRows, { header: headers });
  workbook.Sheets["Text Records"] = newWorksheet;
  if (!workbook.SheetNames.includes("Text Records")) {
    workbook.SheetNames.push("Text Records");
  }

  XLSX.writeFile(workbook, recordsFile);
  return { savedPath: recordsFile, recordCount: existingRows.length };
}

// IPC Handlers for text extraction
ipcMain.handle("get-available-languages-text", async (_event, workspacePath) => {
  try {
    return getAvailableLanguages(workspacePath);
  } catch (error) {
    throw new Error(`Failed to get available languages: ${error.message}`);
  }
});

ipcMain.handle("extract-text-from-language", async (_event, workspacePath, language) => {
  try {
    const filePath = getLanguageTextFilePath(workspacePath, language);
    const content = readTextFile(filePath);
    
    // Parse the text file format: "number  TXF_ID  "translation""
    const lines = content.split("\n").filter((line) => line.trim().length > 0);
    const parsedLines = [];
    
    lines.forEach((line, idx) => {
      // Match pattern: optional number, TXF_ID, then quoted text
      const match = line.match(/^\s*\d+\s+(TXF_\w+)\s+"([^"]+)"/);
      if (match) {
        const [_, textId, translation] = match;
        parsedLines.push({
          id: idx + 1,
          textId: textId,
          text: translation,
          fullLine: line
        });
      }
    });
    
    return {
      language,
      lineCount: parsedLines.length,
      lines: parsedLines
    };
  } catch (error) {
    throw new Error(`Failed to extract text: ${error.message}`);
  }
});

ipcMain.handle("search-text-occurrences", async (_event, workspacePath, searchText) => {
  try {
    if (!searchText || searchText.trim().length === 0) {
      return [];
    }
    return searchTextInAllLanguages(workspacePath, searchText);
  } catch (error) {
    throw new Error(`Failed to search text: ${error.message}`);
  }
});

ipcMain.handle("search-text-in-language", async (_event, workspacePath, language, searchText) => {
  try {
    if (!searchText || searchText.trim().length === 0) {
      return [];
    }
    if (!language) {
      return [];
    }

    const langTextPath = path.join(workspacePath, "languageText");
    const fileName = `in2_${language.toLowerCase()}.txt`;
    const filePath = path.join(langTextPath, fileName);

    if (!fs.existsSync(filePath)) {
      return [];
    }

    // Read file with UTF-8 encoding
    const content = fs.readFileSync(filePath, "utf8");
    const lines = content.split("\n").filter((line) => line.trim().length > 0);
    const results = [];
    
    // Search for text (case-insensitive)
    const lowerSearch = searchText.toLowerCase();
    
    lines.forEach((line, lineIdx) => {
      // Match pattern: number  TXF_ID  "translation"
      const match = line.match(/^\s*\d+\s+(TXF_\w+)\s+"([^"]+)"/);
      if (match) {
        const [_, textId, translation] = match;
        const lowerTranslation = translation.toLowerCase();
        
        // Check if search text is found in translation
        if (lowerTranslation.includes(lowerSearch)) {
          results.push({
            language: language,
            textId: textId,  // Use TXF_ID for mapping across languages
            translation: translation,
            context: translation,
            match: true,
            position: lineIdx,
            occurrence: results.length + 1
          });
        }
      }
    });

    return results;
  } catch (error) {
    throw new Error(`Failed to search text in language: ${error.message}`);
  }
});

ipcMain.handle("get-english-translation", async (_event, workspacePath, textId) => {
  try {
    if (!textId || textId.trim().length === 0) {
      return { found: false, translation: "" };
    }

    const englishFilePath = getLanguageTextFilePath(workspacePath, "englishus");
    if (!fs.existsSync(englishFilePath)) {
      return { found: false, translation: "" };
    }

    const content = fs.readFileSync(englishFilePath, "utf8");
    const lines = content.split("\n").filter((line) => line.trim().length > 0);

    for (const line of lines) {
      // Match pattern: number  TXF_ID  "translation"
      const match = line.match(/^\s*\d+\s+(TXF_\w+)\s+"([^"]+)"/);
      if (match) {
        const [_, lineTextId, translation] = match;
        if (lineTextId === textId) {
          return { found: true, translation };
        }
      }
    }

    return { found: false, translation: "" };
  } catch (error) {
    throw new Error(`Failed to get English translation: ${error.message}`);
  }
});

ipcMain.handle("save-text-record", async (_event, workspacePath, record) => {
  try {
    // Persist annotated image if available
    if (record.annotatedDataUrl && record.imagePath) {
      const imageFolder = path.join(workspacePath, "text_record_images");
      const savedImagePath = saveAnnotatedTextImage(record.annotatedDataUrl, imageFolder, record.imagePath);
      record.savedImageName = path.basename(savedImagePath);
    } else {
      record.savedImageName = "";
    }

    // Append the new record into the existing Excel file
    const result = appendTextRecord(workspacePath, record);
    return { ok: true, savedPath: result.savedPath, recordCount: result.recordCount, savedImageName: record.savedImageName };
  } catch (error) {
    return { ok: false, message: error.message };
  }
});

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
