import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { Button, Screen, ScreenBlurb, ScreenTitle } from '../../src/ui/components';

export default function WelcomeScreen() {
  const router = useRouter();
  return (
    <Screen>
      <ScreenTitle>VigorEngine</ScreenTitle>
      <ScreenBlurb>
        A local-first AI fitness coach that remembers your workouts, nutrition, preferences and
        progress, then decides what you should train and eat next.
      </ScreenBlurb>
      <ScreenBlurb>
        Everything you log stays on this device. The only thing that ever leaves it is what you send
        to your own AI coach, using your own API key.
      </ScreenBlurb>
      <View style={{ marginTop: 32 }}>
        <Button label="Get started" onPress={() => router.push('/onboarding/disclaimer')} />
      </View>
    </Screen>
  );
}
