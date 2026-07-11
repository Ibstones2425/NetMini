/* ============================================================
   config.js — Firebase + TMDB configuration.
   Loaded first on every page.
   ============================================================ */

const APP_NAME = 'NetMini';

const FIREBASE_CONFIG = {
  apiKey:            'AIzaSyBADVtX-7uPytV8lfVyws7IBqg3tmKA-0c',
  authDomain:        'netmini-92427.firebaseapp.com',
  projectId:         'netmini-92427',
  storageBucket:     'netmini-92427.firebasestorage.app',
  messagingSenderId: '297392476747',
  appId:             '1:297392476747:web:27ce6f9c08118f334b33ce',
};

const TMDB_CONFIG = {
  API_KEY:       '51a25aa6c9aac627bd65ba2b10b7aafe',
  BASE_URL:      'https://api.themoviedb.org/3',
  IMAGE_BASE_URL:'https://image.tmdb.org/t/p/',
  POSTER_SIZE:   'w342',
  BACKDROP_SIZE: 'original',
  PROFILE_SIZE:  'w185'
};

const PLAYER_S1 = 'https://vsembed.ru/embed';
const PLAYER_S2 = 'https://vidsrc.to/embed';
