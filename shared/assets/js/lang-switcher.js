(function ($) {
	'use strict';

	$(function () {
		if (!window.location.hash) {
			return;
		}

		$('.lang-switcher a').each(function () {
			var $link = $(this);
			var href = $link.attr('href');

			if (href && href.indexOf('#') === -1) {
				$link.attr('href', href + window.location.hash);
			}
		});
	});
})(jQuery);
