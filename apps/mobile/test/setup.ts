/**
 * Test bootstrap: redirect Node's `react-native` resolution at the shim, then
 * let `@testing-library/react-native` register its matchers and its automatic
 * cleanup. The import order matters — the resolver patch has to be in place
 * before Testing Library is loaded.
 */
import './resolveReactNative.cjs';

import '@testing-library/react-native';

// React 19 reads this to decide whether updates must be wrapped in `act`.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
