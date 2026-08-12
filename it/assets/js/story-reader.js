(function () {
	'use strict';

	var PAGE_WIDTH = 596;
	var PAGE_HEIGHT = 842;
	var PAGE_RATIO = PAGE_WIDTH / PAGE_HEIGHT;

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

			// StPageFlip hard LEFT pages ignore rect.left. Keep the book block
			// exactly two pages wide so the cover hinge stays aligned.
			var bookWidth = Math.min(width, maxPageWidth * 2);
			bookEl.style.width = bookWidth + 'px';
			bookEl.style.maxWidth = bookWidth + 'px';
			bookEl.style.maxHeight = height + 'px';

			pageFlip.update();
		}

		function scheduleViewportLimits() {
			requestAnimationFrame(applyViewportLimits);
		}

		if (pageTotal) {
			pageTotal.textContent = pageFlip.getPageCount();
		}

		pageFlip.on('flip', function (e) {
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
				pageFlip.flipPrev();
			});
		}

		if (btnNext) {
			btnNext.addEventListener('click', function () {
				pageFlip.flipNext();
			});
		}

		document.addEventListener('keydown', function (e) {
			if (e.key === 'ArrowLeft') {
				pageFlip.flipPrev();
			} else if (e.key === 'ArrowRight') {
				pageFlip.flipNext();
			}
		});

		updateControls(0);
	});
})();
