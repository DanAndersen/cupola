
Cupola VR Viewer
================

A Chrome packaged app using the USB API to expose Oculus Rift HMD head-tracking data to remote Web applications.

Get the app!
------------

[Download the Cupola VR Viewer from the Chrome Web Store](https://chrome.google.com/webstore/detail/cupola-vr-viewer/ngcnmbgbpmcjbogdkmpeloilgllfneac)

Note: This has only been tested with Windows. It seems likely that it will not function properly on OSX at the moment, and Linux support may require more adjustment by the user. This is because of limitations of Chrome's USB API when it comes to HID devices on Unix-based OSes: http://developer.chrome.com/apps/app_usb.html#caveats

Background
----------

Cupola VR Viewer is a Chrome packaged app that connects the Oculus Rift to browser-based VR environments. It also allows developers to take advantage of WebGL for virtual reality and use Javascript libraries like [three.js](https://github.com/mrdoob/three.js/), while also offering low-latency head-tracking in a post-NPAPI browser world. 

Recent Javascript libraries like [three.js](http://threejs.org/) make it easy to create WebGL 3D environments that run in the browser. Additional libraries like [RiftCamera](https://github.com/troffmo5/OculusStreetView) provide the camera distortion needed for the Rift's lenses. However, getting the actual Rift orientation data into the browser has had issues:

- [vr.js](https://github.com/benvanik/vr.js) is an NPAPI plugin for Chrome/Firefox that exposes VR devices like the Rift. However, Chrome plans to [block NPAPI plugins starting in January 2014](http://blog.chromium.org/2013/09/saying-goodbye-to-our-old-friend-npapi.html).
- [oculus-bridge](https://github.com/Instrument/oculus-bridge) allows a user to run a standalone application that receives Rift head-tracking data and sends it in a local WebSocket stream. However, in my own tests I found that using WebSockets introduced a latency of about 10 milliseconds that was both noticeable and detrimental to extended use.

Cupola acts as a container for remotely-hosted pages (such as WebGL demos) inside a webview, uses [Chrome's USB API](http://developer.chrome.com/apps/usb.html) to get orientation data from the Rift hardware, and uses [window.postMessage](https://developer.mozilla.org/en-US/docs/Web/API/Window.postMessage) to make the orientation available to the page inside the webview. Several parts of the C++ Oculus SDK have been reimplemented in Javascript to convert the bytes received over USB into usable orientation values.

If you have calibrated your Oculus Rift, you can drag and drop your configuration files into the Cupola viewer to calibrate it.

Requirements 
------------

- An Oculus Rift
- Google Chrome (>= version 26)
- Windows (or maybe Linux) -- OSX is currently not working, due to some issues with the Chrome USB API: http://developer.chrome.com/apps/app_usb.html#caveats
- [The Cupola VR Viewer app](https://chrome.google.com/webstore/detail/cupola-vr-viewer/ngcnmbgbpmcjbogdkmpeloilgllfneac), available on the Chrome Web Store
- A URL to a VR webpage using cupola.js to handle incoming orientation data

Basic Usage
-----------

- Download and launch the Cupola VR Viewer app from the Chrome Web Store.
- In the Cupola VR Viewer app, open an example page using one of these URLs (paste the URL into the "URL" field in the viewer):
	- [Rings](http://danandersen.bitbucket.org/rings.html) -- a simple WebGL demo with no movement controls, just orientation tracking.
	- [Oculus Bridge First Person](http://danandersen.bitbucket.org/first_person.html) -- an existing demo created for oculus-bridge, adapted to work with Cupola.
- Plug in your Oculus Rift.
- Press "Connect" in the Cupola VR Viewer app. In the provided examples, you may need to click "toggle render mode" to get into Rift mode.

If you need to refresh the page, you can go to the URL address bar and press Enter.

Note: due to security restrictions in Chrome packaged apps, `file:///` URLs are not supported. You must remotely host the WebGL simulation, or locally on `localhost`.

Supporting Cupola in Your VR Application
----------------------------------------

Cupola was designed to be easy to integrate with existing projects, as well as to be compatible with existing solutions like [oculus-bridge](https://github.com/Instrument/oculus-bridge). 

While the Cupola viewer app uses three.js for Vector3 / Quaternion calculations, there are no external dependencies (besides `cupola.js`) for the Cupola client.

```html
<script type='text/javascript' src='./path/to/cupola.js'></script>
```

```javascript
var cupola = new Cupola({
	"onConnect" : function() {
		console.log("Rift is connected");
	},
	"onDisconnect" : function() {
		console.log("Rift is disconnected");
	},
	"onConfigUpdate" : function(config) {
		console.log("Received new config", config);
		console.log("Field of view: " + config.FOV);
	}
	"onOrientationUpdate" : function(quatValues) {
		var values = [quatValues.x, quatValues.y, quatValues.z, quatValues.w];
        console.log("Orientation: " + values.join(", "));
	},
});
cupola.connect();
```

Don't forget to `connect()` it at the end!


Cupola Client Configuration Options
-----------------------------------

The Cupola object accepts a single configuration object that can contain any of these properties. All config values are optional.

`onConnect` - function; a callback invoked when the Cupola client starts receiving data from the Cupola viewer. 

`onDisconnect` - function; a callback invoked when the connection is lost.

`onConfigUpdate` - function; a callback invoked when configuration data is received from the server. A single argument is passed to this callback: a map of the metrics for the HMD. These metrics are needed when rendering any images for use on the Oculus Rift.

`onOrientationUpdate` - function; a callback invoked when new orientation values are sent from the server. A single argument is passed to this callback: an object containing the "x", "y", "z", and "w" values of the orientation quaternion.

`debug` - boolean; default is false.

`timeout` - numeric; number of milliseconds Cupola client will wait after not receiving a quaternion before invoking `onDisconnect()`. Default is 1000 ms.

Cupola Client Methods
---------------------

`connect` - allows the Cupola client object to invoke the callbacks when new messages are received from the Cupola viewer.

`disconnect` - disconnects the Cupola client from the Cupola viewer. The viewer app will still send messages to the client but the client will not invoke any set callbacks.

`isConnected` - returns true if the Cupola client is set to handle messages from the viewer, false otherwise

`getOrientation` - alternative to using the `onOrientationUpdate` callback; returns last known quaternion values received from viewer:

Example orientation object:

```
{
    "x" : 0.2329875,
    "y" : 1.1288273,
    "z" : 0.1837934,
    "w" : 0.0439387
}
```

`getConfiguration` - alternative to using the `onConfigUpdate` callback; returns the metrics for the HMD. By default, if no config data has been received from the Cupola viewer, this will return the defauly config settings for the Oculus Rift Development Kit.

Example configuration object:

```
{
    "FOV"                       : 125.871,
    "hScreenSize"               : 0.14976,
    "vScreenSize"               : 0.0935,
    "vScreenCenter"             : 0.0468,
    "eyeToScreenDistance"       : 0.041,
    "lensSeparationDistance"    : 0.067,
    "interpupillaryDistance"    : 0.0675,
    "hResolution"               : 1280,
    "vResolution"               : 720,
    "distortionK"               : [1, .22, .24, 0],
    "chromaAbParameter"         : [0.996, -0.004, 1.014, 0],
    "gender"										: "Unspecified" // or "Male" or "Female",
    "playerHeight"							: 1.77
}
```

Cupola API
----------

If you're looking for more finely-tuned control of the head-tracking data coming from Cupola, here are the current types of messages that Cupola will deliver:

New orientation data (quaternion). This is probably the most important message for your application. The Cupola viewer app will send this message whenever it gets an orientation update from the Rift hardware. 

```
{ 
	"version": "1",
	"msg": "quat",
	"data": {
		"x": 0,
		"y": 0,
		"z": 0,
		"w": 1
	}
}
```

New configuration data:

```
{ 
	"version": "1",
	"msg": "config",
	"data": { (configuration object as shown above) }
}
```

Credits
-------

Thanks to the following libraries and projects that have made this project possible. Credit and copyright belong to the respective parties:

- [THREE.js](http://threejs.org/) - [license](https://github.com/mrdoob/three.js/blob/master/LICENSE)
- [RiftCamera](https://github.com/troffmo5/OculusStreetView) for THREE.js
- [Oculus Rift SDK](http://developer.oculusvr.com)
- [oculus-bridge](https://github.com/Instrument/oculus-bridge) - [license](https://github.com/Instrument/oculus-bridge/blob/master/LICENSE)
- [riftlibrary](https://github.com/sebastianherp/riftlibrary) (Rift library for Java/Android apps) - [license](https://github.com/sebastianherp/riftlibrary/blob/master/LICENSE)


