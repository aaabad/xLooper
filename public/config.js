// Signup / directory notices. signupTopic is an ntfy.sh topic name.
// Firestore (project xircle-a43cf) is the lasting global directory. This
// topic is only the fallback when Firebase auth or rules are not ready.
// Set signupTopic to a full https URL to POST the same hash JSON to your
// own backend (name and SHA-256 hashes, never the raw email or phone).
window.XLOOPER_CONFIG={
  signupTopic:'xlooper-signups-e6a51d389a90b9453407d779800f61b9',
  // Optional pars and yardages. GolfCourseAPI needs a free key from
  // https://golfcourseapi.com (about 35 requests a day). Leave blank to skip.
  // Paste the key, or the full "Key ..." / "Bearer ..." header value.
  golfCourseApiKey:'',
  // Public web config for the shared xircle.us Firebase project.
  // This appId is xLooper's sub-xircle key. KOR-World uses a different
  // appId on the same project; it is documented in the README only.
  // Never paste a service-account private key.
  // Publish firestore.rules in the Firebase console (production mode
  // denies every read and write until you do). Anonymous sign-in is on.
  firebase:{
    apiKey:'AIzaSyCjmDiNxEZs4Ju-NHLLHfWrzjogkJclYIk',
    authDomain:'xircle-a43cf.firebaseapp.com',
    projectId:'xircle-a43cf',
    storageBucket:'xircle-a43cf.firebasestorage.app',
    messagingSenderId:'380596925925',
    appId:'1:380596925925:web:49c554c85142de53656b0c'
  }
};
