chrome.app.runtime.onLaunched.addListener(function() {
  chrome.app.window.create(

  	'window.html', 

	  // createwindowoptions
	  {
	    'bounds': {
	      'width': 800,
	      'height': 600
	    },
	    //frame: 'none'	// removes minimize/maximize/close buttons too
	  },

	  // callback
	  function(win) {
        //win.maximize();
    }
	);
});