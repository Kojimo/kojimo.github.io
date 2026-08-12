(function () {
	'use strict';

	var PAGE_WIDTH = 596;
	var PAGE_HEIGHT = 842;
	var PAGE_RATIO = PAGE_WIDTH / PAGE_HEIGHT;
	var MIN_ZOOM = 1;
	var MAX_ZOOM = 3;
	var ZOOM_STEP = 0.25;
	var PAN_THRESHOLD = 12;
	var FLIP_ZONE_RATIO = 0.25;

	document.addEventListener('DOMContentLoaded', function () {
		var bookEl = document.getElementById('book');
		if (!bookEl || typeof St === 'undefined' || !St.PageFlip) {
			return;
		}

		var bookWrap = document.querySelector('.story-reader-book-wrap');
		var pageCurrent = document.querySelector('.page-current');
		var pageTotal = document.querySelector('.page-total');
		var btnPrev = document.querySelector('.btn-prev');
		var btnNext = document.querySelector('.btn-next');
		var navEl = document.querySelector('.story-reader-nav');
		var scalerEl = document.createElement('div');

		scalerEl.className = 'story-reader-book-scaler';
		if (bookWrap && bookEl.parentNode === bookWrap) {
			bookWrap.insertBefore(scalerEl, bookEl);
			scalerEl.appendChild(bookEl);
		} else {
			scalerEl = bookEl;
		}

		var zoom = 1;
		var panX = 0;
		var panY = 0;
		var isPinching = false;
		var pinchStartDist = 0;
		var pinchStartZoom = 1;
		var dragState = null;
		var btnZoomOut = null;
		var btnZoomIn = null;
		var zoomLevelEl = null;

		var pageFlip = new St.PageFlip(bookEl, {
			width: PAGE_WIDTH,
			height: PAGE_HEIGHT,
			size: 'stretch',
			minWidth: 360,
			maxWidth: 700,
			minHeight: 508,
			maxHeight: 990,
			maxShadowOpacity: 0.5,
			showCover: true,
			mobileScrollSupport: true
		});

		pageFlip.loadFromHTML(bookEl.querySelectorAll('.page'));

		function setReaderViewportHeight() {
			var height = window.visualViewport
				? window.visualViewport.height
				: window.innerHeight;
			document.documentElement.style.setProperty('--reader-vh', (height * 0.01) + 'px');
		}

		function touchDistance(touches) {
			var dx = touches[0].clientX - touches[1].clientX;
			var dy = touches[0].clientY - touches[1].clientY;
			return Math.hypot(dx, dy);
		}

		function clampPan() {
			if (zoom <= 1 || !bookWrap) {
				panX = 0;
				panY = 0;
				return;
			}

			var wrapWidth = bookWrap.clientWidth;
			var wrapHeight = bookWrap.clientHeight;
			var bookWidth = bookEl.offsetWidth;
			var bookHeight = bookEl.offsetHeight;
			var scaledWidth = bookWidth * zoom;
			var scaledHeight = bookHeight * zoom;
			var maxPanX = Math.max(0, (scaledWidth - wrapWidth) / 2);
			var maxPanY = Math.max(0, (scaledHeight - wrapHeight) / 2);

			panX = Math.max(-maxPanX, Math.min(maxPanX, panX));
			panY = Math.max(-maxPanY, Math.min(maxPanY, panY));
		}

		function applyPanDelta(dx, dy) {
			panX += dx;
			panY += dy;
			clampPan();
			applyTransform(false);
		}

		function resetPanToTop() {
			panX = 0;
			if (zoom <= 1 || !bookWrap) {
				panY = 0;
			} else {
				var wrapHeight = bookWrap.clientHeight;
				var bookHeight = bookEl.offsetHeight;
				var scaledHeight = bookHeight * zoom;
				panY = Math.max(0, (scaledHeight - wrapHeight) / 2);
			}
			clampPan();
			applyTransform(false);
		}

		function stopPanning() {
			if (bookWrap) {
				bookWrap.classList.remove('is-panning');
			}
		}

		function resetDrag() {
			dragState = null;
			stopPanning();
		}

		function applyTransform(animate) {
			scalerEl.classList.toggle('is-transforming', !animate);
			scalerEl.style.transform = 'translate(' + panX + 'px, ' + panY + 'px) scale(' + zoom + ')';
			if (bookWrap) {
				bookWrap.classList.toggle('is-zoomed', zoom > 1);
			}
		}

		function updateZoomControls() {
			if (btnZoomOut) {
				btnZoomOut.disabled = zoom <= MIN_ZOOM;
			}
			if (btnZoomIn) {
				btnZoomIn.disabled = zoom >= MAX_ZOOM;
			}
			if (zoomLevelEl) {
				zoomLevelEl.textContent = Math.round(zoom * 100) + '%';
			}
		}

		function setZoom(nextZoom, animate) {
			zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom));
			if (zoom <= MIN_ZOOM) {
				zoom = MIN_ZOOM;
				panX = 0;
				panY = 0;
			} else {
				clampPan();
			}
			applyTransform(animate !== false);
			updateZoomControls();
			if (zoom <= 1 && bookWrap) {
				bookWrap.classList.remove('is-flip-zone-prev', 'is-flip-zone-next');
			}
		}

		function flipPage(direction) {
			if (direction < 0) {
				pageFlip.flipPrev();
			} else {
				pageFlip.flipNext();
			}
			if (zoom > 1) {
				resetPanToTop();
			}
		}

		function handleZoomedTap(clientX) {
			if (!bookWrap || zoom <= 1) {
				return;
			}

			var rect = bookWrap.getBoundingClientRect();
			if (!rect.width) {
				return;
			}

			flipPage((clientX - rect.left) / rect.width < 0.5 ? -1 : 1);
		}

		function isFlipZone(clientX) {
			if (!bookWrap) {
				return false;
			}

			var rect = bookWrap.getBoundingClientRect();
			if (!rect.width) {
				return false;
			}

			var relX = (clientX - rect.left) / rect.width;
			return relX <= FLIP_ZONE_RATIO || relX >= 1 - FLIP_ZONE_RATIO;
		}

		function shouldStartPan(clientX) {
			return zoom > 1 && !isFlipZone(clientX);
		}

		function updateFlipZoneCursor(clientX) {
			if (!bookWrap || zoom <= 1) {
				if (bookWrap) {
					bookWrap.classList.remove('is-flip-zone-prev', 'is-flip-zone-next');
				}
				return;
			}

			var rect = bookWrap.getBoundingClientRect();
			var relX = (clientX - rect.left) / rect.width;
			bookWrap.classList.toggle('is-flip-zone-prev', relX <= FLIP_ZONE_RATIO);
			bookWrap.classList.toggle('is-flip-zone-next', relX >= 1 - FLIP_ZONE_RATIO);
		}

		function createZoomControls() {
			if (!navEl) {
				return;
			}

			var zoomGroup = document.createElement('div');
			zoomGroup.className = 'story-reader-zoom';

			btnZoomOut = document.createElement('button');
			btnZoomOut.type = 'button';
			btnZoomOut.className = 'btn-zoom-out';
			btnZoomOut.setAttribute('aria-label', 'Zoom out');
			btnZoomOut.textContent = '\u2212';

			zoomLevelEl = document.createElement('span');
			zoomLevelEl.className = 'story-reader-zoom-level';
			zoomLevelEl.setAttribute('aria-live', 'polite');
			zoomLevelEl.textContent = '100%';

			btnZoomIn = document.createElement('button');
			btnZoomIn.type = 'button';
			btnZoomIn.className = 'btn-zoom-in';
			btnZoomIn.setAttribute('aria-label', 'Zoom in');
			btnZoomIn.textContent = '+';

			zoomGroup.appendChild(btnZoomOut);
			zoomGroup.appendChild(zoomLevelEl);
			zoomGroup.appendChild(btnZoomIn);

			if (btnNext && btnNext.parentNode === navEl) {
				navEl.insertBefore(zoomGroup, btnNext);
			} else {
				navEl.appendChild(zoomGroup);
			}

			btnZoomOut.addEventListener('click', function () {
				setZoom(zoom - ZOOM_STEP, true);
			});

			btnZoomIn.addEventListener('click', function () {
				setZoom(zoom + ZOOM_STEP, true);
			});

			updateZoomControls();
		}

		function startDrag(x, y, pointerType) {
			dragState = {
				startX: x,
				startY: y,
				lastX: x,
				lastY: y,
				panStarted: false,
				pointer: pointerType
			};
		}

		function moveDrag(x, y, e) {
			if (!dragState) {
				return false;
			}

			var dx = x - dragState.startX;
			var dy = y - dragState.startY;

			if (!dragState.panStarted) {
				if (Math.hypot(dx, dy) < PAN_THRESHOLD) {
					return false;
				}
				dragState.panStarted = true;
				if (bookWrap) {
					bookWrap.classList.add('is-panning');
				}
			}

			applyPanDelta(x - dragState.lastX, y - dragState.lastY);
			dragState.lastX = x;
			dragState.lastY = y;

			if (e) {
				e.preventDefault();
				e.stopPropagation();
			}
			return true;
		}

		function endDrag(x, y) {
			if (!dragState) {
				return;
			}

			var totalMove = Math.hypot(x - dragState.startX, y - dragState.startY);
			if (!dragState.panStarted && totalMove < PAN_THRESHOLD && zoom > 1) {
				handleZoomedTap(x);
			}

			resetDrag();
		}

		function bindPinchAndPan() {
			if (!bookWrap) {
				return;
			}

			scalerEl.addEventListener('mousedown', function (e) {
				if (zoom <= 1 || e.button !== 0 || isFlipZone(e.clientX)) {
					return;
				}

				startDrag(e.clientX, e.clientY, 'mouse');
				e.preventDefault();
				e.stopPropagation();
			}, { capture: true });

			document.addEventListener('mousemove', function (e) {
				if (!dragState || dragState.pointer !== 'mouse' || zoom <= 1) {
					return;
				}

				moveDrag(e.clientX, e.clientY, dragState.panStarted ? e : null);
			});

			document.addEventListener('mouseup', function (e) {
				if (!dragState || dragState.pointer !== 'mouse') {
					return;
				}

				endDrag(e.clientX, e.clientY);
			});

			scalerEl.addEventListener('touchstart', function (e) {
				if (e.touches.length === 2) {
					resetDrag();
					isPinching = true;
					pinchStartDist = touchDistance(e.touches);
					pinchStartZoom = zoom;
					e.preventDefault();
					return;
				}

				if (e.touches.length === 1 && shouldStartPan(e.touches[0].clientX)) {
					startDrag(e.touches[0].clientX, e.touches[0].clientY, 'touch');
					e.preventDefault();
					e.stopPropagation();
				}
			}, { passive: false, capture: true });

			scalerEl.addEventListener('touchmove', function (e) {
				if (isPinching && e.touches.length === 2) {
					var distance = touchDistance(e.touches);
					if (pinchStartDist > 0) {
						setZoom(pinchStartZoom * (distance / pinchStartDist), false);
					}
					e.preventDefault();
					return;
				}

				if (dragState && dragState.pointer === 'touch' && e.touches.length === 1 && zoom > 1) {
					moveDrag(e.touches[0].clientX, e.touches[0].clientY, e);
				}
			}, { passive: false, capture: true });

			scalerEl.addEventListener('touchend', function (e) {
				if (e.touches.length === 0) {
					isPinching = false;
					if (dragState && dragState.pointer === 'touch') {
						var touch = e.changedTouches[0];
						endDrag(touch ? touch.clientX : dragState.lastX, touch ? touch.clientY : dragState.lastY);
					} else {
						resetDrag();
					}
					return;
				}

				if (e.touches.length === 1) {
					isPinching = false;
					if (shouldStartPan(e.touches[0].clientX)) {
						startDrag(e.touches[0].clientX, e.touches[0].clientY, 'touch');
					} else {
						resetDrag();
					}
				}
			}, { capture: true });

			scalerEl.addEventListener('touchcancel', function () {
				isPinching = false;
				resetDrag();
			}, { capture: true });

			bookWrap.addEventListener('mousemove', function (e) {
				updateFlipZoneCursor(e.clientX);
			});

			bookWrap.addEventListener('mouseleave', function () {
				if (bookWrap) {
					bookWrap.classList.remove('is-flip-zone-prev', 'is-flip-zone-next');
				}
			});
		}

		function isLandscapeSpreadEnd(index) {
			var total = pageFlip.getPageCount();
			return pageFlip.getOrientation() === 'landscape'
				&& total > 1
				&& index + 1 === total - 1;
		}

		function displayPageNumber(index) {
			return isLandscapeSpreadEnd(index) ? pageFlip.getPageCount() : index + 1;
		}

		function onLastPage(index) {
			return isLandscapeSpreadEnd(index) || index >= pageFlip.getPageCount() - 1;
		}

		function updateControls(index) {
			if (pageCurrent) {
				pageCurrent.textContent = displayPageNumber(index);
			}
			if (btnPrev) {
				btnPrev.disabled = index <= 0;
			}
			if (btnNext) {
				btnNext.disabled = onLastPage(index);
			}
		}

		function applyViewportLimits() {
			if (!bookWrap || (pageFlip.getState && pageFlip.getState() !== 'read')) {
				return;
			}

			var width = bookWrap.clientWidth;
			var height = bookWrap.clientHeight;
			if (width <= 0 || height <= 0) {
				return;
			}

			var settings = pageFlip.getSettings();
			var maxPageWidth = Math.max(
				settings.minWidth,
				Math.floor(Math.min(width / 2, height * PAGE_RATIO))
			);

			settings.maxWidth = maxPageWidth;
			settings.maxHeight = Math.max(height, settings.minHeight);

			var bookWidth = Math.min(width, maxPageWidth * 2);
			bookEl.style.width = bookWidth + 'px';
			bookEl.style.maxWidth = bookWidth + 'px';
			bookEl.style.maxHeight = height + 'px';

			pageFlip.update();
			clampPan();
			applyTransform(false);
		}

		function scheduleViewportLimits() {
			requestAnimationFrame(applyViewportLimits);
		}

		setReaderViewportHeight();
		if (window.visualViewport) {
			window.visualViewport.addEventListener('resize', setReaderViewportHeight);
			window.visualViewport.addEventListener('scroll', setReaderViewportHeight);
		}
		window.addEventListener('resize', setReaderViewportHeight);

		createZoomControls();
		bindPinchAndPan();

		if (pageTotal) {
			pageTotal.textContent = pageFlip.getPageCount();
		}

		pageFlip.on('flip', function (e) {
			if (zoom > 1) {
				resetPanToTop();
			}
			updateControls(e.data);
		});
		pageFlip.on('changeOrientation', function () {
			updateControls(pageFlip.getCurrentPageIndex());
		});
		pageFlip.on('init', scheduleViewportLimits);

		if (typeof ResizeObserver !== 'undefined' && bookWrap) {
			new ResizeObserver(scheduleViewportLimits).observe(bookWrap);
		}

		window.addEventListener('resize', scheduleViewportLimits);

		if (btnPrev) {
			btnPrev.addEventListener('click', function () {
				flipPage(-1);
			});
		}

		if (btnNext) {
			btnNext.addEventListener('click', function () {
				flipPage(1);
			});
		}

		document.addEventListener('keydown', function (e) {
			if (e.key === 'ArrowLeft') {
				flipPage(-1);
			} else if (e.key === 'ArrowRight') {
				flipPage(1);
			} else if ((e.key === '+' || e.key === '=') && (e.ctrlKey || e.metaKey)) {
				e.preventDefault();
				setZoom(zoom + ZOOM_STEP, true);
			} else if (e.key === '-' && (e.ctrlKey || e.metaKey)) {
				e.preventDefault();
				setZoom(zoom - ZOOM_STEP, true);
			} else if (e.key === '0' && (e.ctrlKey || e.metaKey)) {
				e.preventDefault();
				setZoom(MIN_ZOOM, true);
			}
		});

		updateControls(0);
	});
})();
