var SensorFilterScalar = function(capacity) {

  var mCapacity = capacity || 20;
  var mRunningTotal = 0;
  var mElements = [];
  var mLastIdx = -1;
  var mCount = 0;

  // initialize each element of circular buffer
  for (var i = 0; i < mCapacity; i++) {
    mElements[i] = 0;
  }

  // Add a new element to the filter
  // Updates the running sum value
  var addElement = function(e) {
  	var nextIdx = (mLastIdx + 1) % mCapacity;

    mRunningTotal += (e - mElements[nextIdx]);

  	// circular buffer add element
  	mLastIdx = (mLastIdx + 1) % mCapacity;
  	mElements[mLastIdx] = e;
  	if (mCount < mCapacity) {
  		mCount++;
  	}
  	// end circular buffer add element
  	if (mLastIdx == 0) {
  		// update the cached total to avoid error accumulation
  		mRunningTotal = 0;
  		for (var i = 0; i < mCount; i++) {
        mRunningTotal += mElements[i];
  		}
  	}
  };

  var mean = function() {
    return (mCount == 0) ? 0 : mRunningTotal / mCount;
  };

  return {
    'addElement': addElement,
    'mean': mean
  };
}