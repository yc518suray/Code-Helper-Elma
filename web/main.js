pdfjsLib.GlobalWorkerOptions.workerSrc =
'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

/* ----- 畫面彩繪相關 ----- */
let pdfDoc = null;
let current_pdf_path = null;
let pageNum = 1;
let pageIsRendering = false;
let pageNumPending = null;
let currentScale = 1.4;
let currentHighlightCoords = null;

/* ----- 標記方框相關 ----- */
let isMarkMode = false;
let isDragging = false;
let startX = 0, startY = 0;
let markBox = null;
const wrapper = document.getElementById('canvas-wrapper');

const canvas = document.getElementById('pdf-canvas');
const ctx = canvas.getContext('2d');

// ----- 切換標記模式 ----- //
function toggleMarkMode() {
	isMarkMode = !isMarkMode;
	const btn = document.getElementById('toggle-mark-btn');
	const status = document.getElementById('mark-status');

	if (isMarkMode) {
		document.body.classList.add('mark-mode');
		btn.style.backgroundColor = '#00e676';
		btn.style.color = '#000';
		status.textContent = "先選取程式碼，再標記對應的內容";
	} else {
		document.body.classList.remove('mark-mode');
		btn.style.backgroundColor = '';
		btn.style.color = '';
		status.textContent = '';
	}
	if (window.pywebview && window.pywebview.api) {
		if (isMarkMode) {
			window.pywebview.api.set_mark_mode(1);
		} else {
			window.pywebview.api.set_mark_mode(0);
		}
	}
}

// ----- 選擇欲標記的 PDF 檔案 ----- //
function selectPdfFile() {
	if (window.pywebview && window.pywebview.api) {
		window.pywebview.api.open_file_dialog();
	}
}

// ----- 監聽滑鼠點擊的動作 ----- //
wrapper.addEventListener('mousedown', (e) => {
	if (!isMarkMode) return;
	isDragging = true;

	e.preventDefault();

	const rect = wrapper.getBoundingClientRect();
	startX = e.clientX - rect.left;
	startY = e.clientY - rect.top;

	markBox = document.createElement('div');
	markBox.className = 'mark-box';
	markBox.style.left = `${startX}px`;
	markBox.style.top = `${startY}px`;
	markBox.style.width = '0px';
	markBox.style.height = '0px';
	markBox.style.display = 'block';

	document.getElementById('highlight-layer').appendChild(markBox);
});

// ----- 監聽游標移動的動作 ----- //
window.addEventListener('mousemove', (e) => {
	if (!isDragging || !markBox) return;
	const rect = wrapper.getBoundingClientRect();
	const currentX = e.clientX - rect.left;
	const currentY = e.clientY - rect.top;

	const left = Math.min(startX, currentX);
	const top = Math.min(startY, currentY);
	const width = Math.abs(currentX - startX);
	const height = Math.abs(currentY - startY);

	markBox.style.left = `${left}px`;
	markBox.style.top = `${top}px`;
	markBox.style.width = `${width}px`;
	markBox.style.height = `${height}px`;
});

// ----- 監聽滑鼠放開的動作 ----- //
window.addEventListener('mouseup', (e) => {
	if (!isDragging) return;
	isDragging = false;
	if (!markBox) return;

	const currentX = parseFloat(markBox.style.left);
	const currentY = parseFloat(markBox.style.top);
	const currentW = parseFloat(markBox.style.width);
	const currentH = parseFloat(markBox.style.height);

	markBox.remove();
	markBox = null;

	if (currentW < 5 || currentH < 5) return;
	const normalizedCoords = [
		Math.round(currentX / currentScale),
		Math.round(currentY / currentScale),
		Math.round(currentW / currentScale),
		Math.round(currentH / currentScale)
	];

	toggleMarkMode();
	onCropFinished(pageNum, normalizedCoords);
});

// ----- 結束標記方框後 ----- //
function onCropFinished(page, coords) {
	drawHighlightBoxCoords(coords);

	if (window.pywebview && window.pywebview.api) {
		window.pywebview.api.save_mapping_dialog(page, coords);
		
		// ----- 儲存標記或是放棄儲存後，方框就可以移除 ----- //
		currentHighlightCoords = null;
		drawHighlightBox();
	}
}

function drawHighlightBoxCoords(coords) {
	currentHighlightCoords = coords;
	drawHighlightBox();
}

// ----- 呈現指定的 PDF 頁面 ----- //
function renderPage(num) {
	pageIsRendering = true;		

	pdfDoc.getPage(num).then(page => {
		const viewport = page.getViewport({ scale: currentScale });
		canvas.height = viewport.height;
		canvas.width = viewport.width;

		const renderContext = {
			canvasContext: ctx,
			viewport: viewport
		};

		const renderTask = page.render(renderContext);

		// ----- 彩繪完成後 ----- //
		renderTask.promise.then(() => {
			pageIsRendering = false;
			if (pageNumPending !== null) {
				renderPage(pageNumPending);
				pageNumPending = null;
			} else {
				drawHighlightBox();
			}
		});
	});

	document.getElementById('page-num').textContent = num;
	document.getElementById('zoom-val').textContent = `${Math.round(currentScale * 100)}%`;
}

function zoom(delta) {
	const newScale = currentScale + delta;
	if (newScale >= 0.5 && newScale <= 3.0) {
		currentScale = newScale;
		queueRenderPage(pageNum);
	}
}

function drawHighlightBox() {
	const layer = document.getElementById('highlight-layer');
	layer.innerHTML = '';
	if (!currentHighlightCoords) return;

	const [x, y, w, h] = currentHighlightCoords;
	const scaledX = x * currentScale;
	const scaledY = y * currentScale;
	const scaledW = w * currentScale;
	const scaledH = h * currentScale;

	const box = document.createElement('div');
	box.className = 'highlight-box';
	box.style.left = `${scaledX}px`;
	box.style.top = `${scaledY}px`;
	box.style.width = `${scaledW}px`;
	box.style.height = `${scaledH}px`;

	layer.appendChild(box);

	/* ----- 自動把畫面帶到方框中心 ----- */
	box.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ----- 目前正在彩繪的話，將頁面排入 queue ----- //
function queueRenderPage(num) {
	if (pageIsRendering) {
		pageNumPending = num;
	} else {
		renderPage(num);
	}
}

// ----- (API for python) 載入指定的 PDF 檔案 ----- //
function loadPDF(pdfUrl, fresh = null) {
	current_pdf_path = pdfUrl;
	if (fresh) {
		currentHighlightCoords = null;
		pageNum = 1;
	}
	document.getElementById('status-msg').textContent = "載入 PDF 檔案中...";
	
	pdfjsLib.getDocument(pdfUrl).promise.then(pdfDoc_ => {
		pdfDoc = pdfDoc_;
		document.getElementById('page-count').textContent = pdfDoc.numPages;
		document.getElementById('status-msg').textContent = "PDF 檔案載入完畢";

		queueRenderPage(pageNum);
	}).catch(err => {
		console.error("PDF 檔案載入失敗：", err);
		document.getElementById('status-msg').textContent = "PDF 檔案載入失敗";
	});
}

// ----- (API for python) 跳轉到指定頁面 ----- //
function jumpToPage(page, coords = null, pdf_path = null) {
	currentHighlightCoords = coords;
	if (pdf_path && current_pdf_path !== pdf_path) {
		loadPDF(pdf_path);
	}

	if (!pdfDoc) {
		console.warn("PDF 檔案尚在載入中");
		return;
	}

	let targetPage = parseInt(page, 10);
	if (targetPage === 0) {
		targetPage = pageNum;
	}
	if (targetPage >= 1 && targetPage <= pdfDoc.numPages) {
		pageNum = targetPage;
		queueRenderPage(pageNum);
		if (!currentHighlightCoords) {
			document.getElementById('status-msg').textContent = "找無對應標記";
		} else {
			document.getElementById('status-msg').textContent = `已跳轉至第 ${pageNum} 頁`;
		}
	} else {
		console.warn(`無效頁碼：${page}`);
	}
}

// ----- 上一頁/下一頁按鈕 ----- //
function changePage(offset) {
	if (!pdfDoc) return;
	const newPage = pageNum + offset;
	if (newPage >= 1 && newPage <= pdfDoc.numPages) {
		jumpToPage(newPage);
	}
}

window.addEventListener('pywebviewready', function() {
	console.log("Pywebview 準備就緒");
	loadPDF("pdf/sample.pdf");
});
