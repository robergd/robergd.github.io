$( document ).ready(function() {
	$(".flex-item").hover(function(){
		if ($(this).hasClass("active")){
			$(this).removeClass("active");
		} else {
			$(this).addClass("active");
		}
	}
	);
});
