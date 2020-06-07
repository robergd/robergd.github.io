// init handlers for messages presentation
$(function() {
    // show last message
    $('.thread .message.collapsed').last().removeClass('collapsed')

    //collapse the whole message
    $('.message-header-top').click(function (e) {
        var container = $(e.target).closest('.message')
        var headerMid = $(e.target).closest('.spacer, .preview')


        //never collapse inner messages
        if (container.is('.message .message')) {
            container.removeClass('collapsed')
            return
        }


        if (container.is(':last-of-type')) {
            container.removeClass('collapsed')
            return
        }

        //when collapsed - accept click anywhere
        //when expanded only in headerMid
        if (headerMid.length != 0 || container.hasClass('collapsed')) {
            container.toggleClass('collapsed')
            e.preventDefault();
            e.stopPropagation();
        }
    })


    //collapse recipients
    $('.message-recipients').click(function(e) {
        var toggle = $(e.target).closest('.toggle')
        var container = $(e.target).closest('.message-recipients')
        var headerContainer = $(e.target).closest('.message-header')


        //on expanded container we have to click on toggle.
        //on collapsed we can click anywhere
        if (toggle.length != 0 || headerContainer.is('.message-header.short')) {
            headerContainer.toggleClass('short')
            e.preventDefault();
            e.stopPropagation();
        }
    })


    //collapse history
    $('.message-history > .toggle').click(function(e) {
        $(e.target).parents('.message-history').toggleClass('collapsed')
        e.preventDefault();
        e.stopPropagation();
    })


    //set same from-user width for all messages
    var $fromUsers = $('.thread > .message > .message-header > .message-header-top > .from-user')
    var $emails = $fromUsers.children('.email')


    $emails.css('display', 'none')
    $fromUsers.css('overflow', 'visible')

    var longestUser = 0
    for (var i=0; i<$fromUsers.length; i++) {
        var w = $($fromUsers[i]).width()
        if (w > longestUser) {
            longestUser = w
        }
    }

    $emails.css('display', '')
    $fromUsers.css('overflow', '')

    //console.log(longestUser)

    if (longestUser > 228) {
        longestUser = 228
    }

    longestUser += 2 //to overcome ellipsis

    //$fromUsers.css("min-width", longestUser + "px").css("max-width", longestUser + "px")

    //add magic css rule
    $("head").append('<style> .message.collapsed > .message-header .from-user { min-width: '+longestUser+'px; max-width: '+longestUser+'px; }</style>');
});

$(function() {
    $('#open-in-spark-url').click(function(e) {
        setTimeout(function () {
            window.location = 'https://sparkmailapp.com/download'
        }, 2000)
    })
})

window.addEventListener("load", function(){
    window.cookieconsent.initialise({
        palette: {
            popup: {
                background: "#ffffff"
            },
            button: {
                background: "#4283DB",
                text: "#ffffff"
            }
        },
        theme: "block",
        content: {
            message: "We use cookies to personalize your experience on our websites. By using our website, you agree to the use of cookies as described in our ",
            link: "Privacy Policy",
            href: "https://readdle.com/privacy"
        },
        law: {
            regionalLaw: false
        },
        location: true
    });

    $('.time-full').each(function(){
        $(this).text(new Date(parseInt($(this).attr('data-ts'))).toLocaleTimeString('en-US', {
            day:'numeric',
            month: 'short',
            weekday: 'long',
            hour12: true,
            hour: '2-digit',
            minute:'2-digit'
        }));
    });

    $('.time-short').each(function(){
        $(this).text(new Date(parseInt($(this).attr('data-ts'))).toLocaleTimeString('en-US', {
            day: 'numeric',
            month: 'numeric',
            hour12: true,
            hour: '2-digit',
            minute:'2-digit'
        }));
    });
});
