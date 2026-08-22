import { registerRootComponent } from 'expo';

/**
 * The App module graph is required inside a try/catch on purpose.
 *
 * Anything that throws while a module is *evaluating* — a missing native
 * module, a bad import, a top-level config check — happens before React ever
 * renders. React's ErrorBoundary in App.tsx cannot catch that (it only sees
 * errors thrown during render of its children), and the native splash screen
 * only lifts once a first frame is drawn. The result is an app that sits on
 * the splash screen forever with nothing on screen, no red box, and no way to
 * tell what failed without a USB cable and logcat.
 *
 * Catching it here means a startup failure shows its own message instead,
 * which is both a better user experience than an infinite splash and the only
 * practical way to diagnose a store build on someone else's device.
 */
let RootComponent: React.ComponentType;

try {
  RootComponent = require('./App').default;
} catch (error) {
  const { Text, View } = require('react-native');
  const React = require('react');

  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error && error.stack ? error.stack : '';

  RootComponent = function StartupErrorScreen() {
    return React.createElement(
      View,
      {
        style: {
          flex: 1,
          backgroundColor: '#030206',
          padding: 24,
          justifyContent: 'center',
        },
      },
      React.createElement(
        Text,
        { style: { color: '#FF6B6B', fontSize: 18, fontWeight: 'bold', marginBottom: 12 } },
        'GC failed to start'
      ),
      React.createElement(
        Text,
        { style: { color: '#F3F4F6', fontSize: 13, marginBottom: 16 } },
        message
      ),
      React.createElement(
        Text,
        { style: { color: '#9CA3AF', fontSize: 10 }, numberOfLines: 20 },
        stack
      )
    );
  };
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(RootComponent);
