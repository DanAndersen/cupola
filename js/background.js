chrome.app.runtime.onLaunched.addListener(function() {
  chrome.app.window.create(

  	'window.html', 

	  // createwindowoptions
	  {
	    'bounds': {
	      'width': 1024,
	      'height': 720
	    },
	    //frame: 'none'	// removes minimize/maximize/close buttons too
	  },

	  // callback
	  function(win) {
        //win.maximize();
    }
	);
});