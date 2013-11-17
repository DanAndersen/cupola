var renderer, camera;
var scene, element;
var aspectRatio, windowHalf;
var mouse, time;

var controls;
var clock;

var useRift = false;

var riftCam;

var boxes = [];
var core = [];
var dataPackets = [];

var ground, groundGeometry, groundMaterial;

var bodyAngle;
var bodyAxis;
var bodyPosition;
var viewAngle;

var velocity;

var cupola;

var hmdConfig;




var rings = [];

var SKYBOX_DISTANCE = 2500;


// Map for key states
var keys = [];
for(var i = 0; i < 130; i++){
  keys.push(false);
}


function initScene() {
  clock = new THREE.Clock();
  mouse = new THREE.Vector2(0, 0);

  windowHalf = new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2);
  aspectRatio = window.innerWidth / window.innerHeight;
  
  scene = new THREE.Scene();  

  camera = new THREE.PerspectiveCamera(45, aspectRatio, 1, 10000);
  camera.useQuaternion = true;

  camera.position.set(100, 150, 100);
  camera.lookAt(scene.position);

  // Initialize the renderer
  renderer = new THREE.WebGLRenderer({antialias:true});
  //renderer.setClearColor(0xdbf7ff);
  renderer.setSize(window.innerWidth, window.innerHeight);

   //scene.fog = new THREE.Fog(0xdbf7ff, 300, 700);

  element = document.getElementById('viewport');
  element.appendChild(renderer.domElement);

  controls = new THREE.OrbitControls(camera);
}


function initSkybox() {

  // Skybox generated with Spacescape: sourceforge.net/projects/spacescape/
  var imagePrefix = "textures/skybox/space/space_";
  var directions  = ["right1", "left2", "top3", "bottom4", "front5", "back6"];
  

  var imageSuffix = ".jpg";
  var skyGeometry = new THREE.CubeGeometry( SKYBOX_DISTANCE*2, SKYBOX_DISTANCE*2, SKYBOX_DISTANCE*2 ); 

  var materialArray = [];
  for (var i = 0; i < 6; i++)
    materialArray.push( new THREE.MeshBasicMaterial({
      map: THREE.ImageUtils.loadTexture( imagePrefix + directions[i] + imageSuffix ),
      side: THREE.BackSide
    }));
  var skyMaterial = new THREE.MeshFaceMaterial( materialArray );
  var skyBox = new THREE.Mesh( skyGeometry, skyMaterial );
  scene.add( skyBox );
}


function initLights(){

  var ambient = new THREE.AmbientLight(0x222222);
  scene.add(ambient);

  var point = new THREE.DirectionalLight( 0xffffff, 1, 0, Math.PI, 1 );
  point.position.set( -2500, 2500, 1500 );
  
  scene.add(point);
}

function initGeometry(){

  var path = "textures/skybox/space/space_";
  var format = '.jpg';
  var urls = [
      path + "right1" + format, path + "left2" + format,
      path + "top3" + format, path + "bottom4" + format,
      path + "front5" + format, path + "back6" + format
    ];

  var reflectionCube = THREE.ImageUtils.loadTextureCube( urls );
  
  var ringMaterial = new THREE.MeshPhongMaterial( { 
    ambient: 0x000000, 
    envMap: reflectionCube, 
    combine: THREE.MixOperation,
    reflectivity: 0.9,
    shading: THREE.FlatShading 
  } );


  var tubeDiameter = 20;
  var segmentsAroundRadius = 3;

  var initialRingDistance = 250;
  var numRings = 20;
  for (var i = 0; i < numRings; i++) {
    var torusRadius = initialRingDistance + (tubeDiameter * 2 * i);

    var segmentsAroundTorus = 32 * (i+1);

    var torusGeometry = new THREE.TorusGeometry( torusRadius, tubeDiameter, segmentsAroundRadius, segmentsAroundTorus );
    torusGeometry.computeFaceNormals();

    var ring = new THREE.Mesh( torusGeometry, ringMaterial);

    ring.rotation.set(
      Math.random() * Math.PI * 2, 
      Math.random() * Math.PI * 2, 
      Math.random() * Math.PI * 2
    );

    rings.push(ring);
    scene.add(ring);
  }

  var numStars = 100;
  var minStarDistance = initialRingDistance + (tubeDiameter * 2 * numRings);
  var maxStarDistance = SKYBOX_DISTANCE;
  var minStarSize = 30;
  var maxStarSize = 100;


  var starMaterial = new THREE.MeshPhongMaterial( { 
    color: 0xffffff,
    shading: THREE.FlatShading 
  } );

  for(var i = 0; i < numStars; i++){
    var height = Math.random() * maxStarSize+minStarSize;
    
    var box = new THREE.Mesh( new THREE.OctahedronGeometry( height, 0 ), starMaterial);

    // randomly scatter 'stars' outside the rings
    var starR = Math.random() * (maxStarDistance - minStarDistance) + minStarDistance;
    var starTheta = Math.random() * Math.PI;
    var starPhi = Math.random() * Math.PI * 2;

    box.position.set(
      starR * Math.sin(starTheta) * Math.cos(starPhi), 
      starR * Math.sin(starTheta) * Math.sin(starPhi), 
      starR * Math.cos(starTheta)
    );

    box.rotation.set(Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2);
    
    core.push(box);
    scene.add(box);
  }

}


function init(){

  document.addEventListener('keydown', onKeyDown, false);
  document.addEventListener('keyup', onKeyUp, false);
  document.addEventListener('mousedown', onMouseDown, false);
  document.addEventListener('mousemove', onMouseMove, false);

  document.getElementById("toggle-render").addEventListener("click", function(){
    useRift = !useRift;
    onResize();
  });




  window.addEventListener('resize', onResize, false);

  time          = Date.now();
  bodyAngle     = 0;
  bodyAxis      = new THREE.Vector3(0, 1, 0);
  bodyPosition  = new THREE.Vector3(0, 0, 0);
  velocity      = new THREE.Vector3();

  initScene();

  initSkybox();

  initGeometry();
  initLights();

  initParticles();
  
  // Cupola client
  cupola = new Cupola({
    onConnect : bridgeConnected,
    onDisconnect : bridgeDisconnected,
    onConfigUpdate : bridgeConfigUpdated,
    onOrientationUpdate : bridgeOrientationUpdated
  });
  cupola.connect();

  riftCam = new THREE.OculusRiftEffect(renderer);
}

var geometry;
var parameters;
var color, size;
var materials = [];
var particles;
var particleSystems = [];
function initParticles() {

  geometry = new THREE.Geometry();
  for (var i = 0; i < 200; i++) {
    var vertex = new THREE.Vector3();
    vertex.x = Math.random() * 500 * 2 - 500;
    vertex.y = Math.random() * 500 * 2 - 500;
    vertex.z = Math.random() * 500 * 2 - 500;

    geometry.vertices.push(vertex);
  }

  parameters = [
    [ [0.5, 0.5, 0.5], 5 ],
    [ [0.95, 1, 0.5], 4 ],
    [ [0.90, 1, 0.5], 3 ],
    [ [0.85, 1, 0.5], 2 ],
    [ [0.80, 1, 0.5], 1 ]
  ];

  for ( var i = 0; i < parameters.length; i ++ ) {

    color = parameters[i][0];
    size  = parameters[i][1];

    materials[i] = new THREE.ParticleSystemMaterial( { size: size } );

    particles = new THREE.ParticleSystem( geometry, materials[i] );

    particles.rotation.x = Math.random() * 6;
    particles.rotation.y = Math.random() * 6;
    particles.rotation.z = Math.random() * 6;

    particleSystems.push(particles);
    scene.add( particles );

  }
}


function onResize() {
  if(!useRift){
    windowHalf = new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2);
    aspectRatio = window.innerWidth / window.innerHeight;
   
    camera.aspect = aspectRatio;
    camera.updateProjectionMatrix();
   
    renderer.setSize(window.innerWidth, window.innerHeight);
  } else {
    riftCam.setSize(window.innerWidth, window.innerHeight);
    updateHMDResolution(window.innerWidth, window.innerHeight);
  }
}



function updateHMDResolution(width, height) {

  if (!hmdConfig) {
    hmdConfig = riftCam.getHMD();
  }

  hmdConfig.hResolution = width;
  hmdConfig.vResolution = height;

  riftCam.setHMD(hmdConfig);
}

function bridgeConnected(){
  console.log("ready to receive from Cupola");
}

function bridgeDisconnected(){
  console.log("no longer receiving from Cupola");
}

function bridgeConfigUpdated(config){
  console.log("Oculus config updated.");
  riftCam.setHMD(config);      
  onResize();
}

var quat = new THREE.Quaternion();
var quatCam = new THREE.Quaternion();
var xzVector = new THREE.Vector3(0, 0, 1);

function bridgeOrientationUpdated(quatValues) {
  // Do first-person style controls (like the Tuscany demo) using the rift and keyboard.

  // Don't instantiate new objects in here, these should be re-used to avoid garbage collection.

  // make a quaternion for the the body angle rotated about the Y axis.
  //var quat = new THREE.Quaternion();
  quat.setFromAxisAngle(bodyAxis, bodyAngle);

  // make a quaternion for the current orientation of the Rift
  //var quatCam = new THREE.Quaternion(quatValues.x, quatValues.y, quatValues.z, quatValues.w);
  quatCam.set(quatValues.x, quatValues.y, quatValues.z, quatValues.w);

  // multiply the body rotation by the Rift rotation.
  quat.multiply(quatCam);


  // Make a vector pointing along the Z axis and rotate it accoring to the combined look/body angle.
  //var xzVector = new THREE.Vector3(0, 0, 1);
  xzVector.set(0,0,1);
  xzVector.applyQuaternion(quat);

  // Compute the X/Z angle based on the combined look/body angle.  This will be used for FPS style movement controls
  // so you can steer with a combination of the keyboard and by moving your head.
  viewAngle = Math.atan2(xzVector.z, xzVector.x) + Math.PI;

  // Apply the combined look/body angle to the camera.
  camera.quaternion.copy(quat);
}


function onMouseMove(event) {
  mouse.set( (event.clientX / window.innerWidth - 0.5) * 2, (event.clientY / window.innerHeight - 0.5) * 2);
}


function onMouseDown(event) {
  // Stub
  console.log("update.");
}


function onKeyDown(event) {

  if(event.keyCode == 48){ // zero key.
    useRift = !useRift;
    onResize();
  }

  // prevent repeat keystrokes.

  keys[event.keyCode] = true;
}


function onKeyUp(event) {
  keys[event.keyCode] = false;
}


function updateInput(delta) {
 
  // VERY simple gravity/ground plane physics for jumping.
  
  velocity.y -= 0.15;
  
  bodyPosition.y += velocity.y;
  
  if(bodyPosition.y < 15){
    velocity.y *= -0.12;
    bodyPosition.y = 15;
  }
  

  // update the camera position when rendering to the oculus rift.
  if(useRift) {
    camera.position.set(bodyPosition.x, bodyPosition.y, bodyPosition.z);
  }
}

function animate() {
  var delta = clock.getDelta();
  time += delta;
  
  updateInput(delta);

  for(var i = 0; i < rings.length; i++){
    rings[i].rotation.x += delta * 0.25 * 0.5;
    rings[i].rotation.y -= delta * 0.33 * 0.5;
    rings[i].rotation.z += delta * 0.1278 * 0.5;
  }

  for(var i = 0; i < core.length; i++){
    core[i].rotation.x += delta * 0.25 * 3;
    core[i].rotation.y -= delta * 0.33 * 3;
    core[i].rotation.z += delta * 0.1278 * 3;
  }

  for ( i = 0; i < particleSystems.length; i ++ ) {

    var object = particleSystems[ i ];

    if ( object instanceof THREE.ParticleSystem ) {

      object.rotation.y = time * ( i < 4 ? i + 1 : - ( i + 1 ) ) / 10;

    }

  }

  requestAnimationFrame(animate);
  render();
}


function render() {
  var currentRenderer = useRift ? riftCam : renderer;

  if(!useRift){
    controls.update();
  }

  currentRenderer.render(scene, camera);
}


window.onload = function() {
  init();
  animate();
}


