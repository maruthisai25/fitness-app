import { useLocalSearchParams } from 'expo-router';

import { RecipeDetailScreen } from '../../../../src/eat/RecipeDetailScreen';
import { ErrorBanner, Screen } from '../../../../src/ui/components';

export default function RecipeRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  if (!id) {
    return (
      <Screen>
        <ErrorBanner message="No recipe was named in that link." />
      </Screen>
    );
  }
  return <RecipeDetailScreen recipeId={id} />;
}
