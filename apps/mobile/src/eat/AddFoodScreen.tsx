/**
 * Route chrome around {@link AddFoodPanel}: it supplies the day, the food
 * region from the profile, and takes you back to the log once something is
 * written.
 */
import { useQuery } from '@tanstack/react-query';

import { queryKeys, type LocalDate } from '@vigor/core';

import { usePlatform, useRepos } from '../db/AppDataProvider';
import { Screen, ScreenBlurb, ScreenTitle } from '../ui/components';
import { Note } from '../ui/primitives';
import { AddFoodPanel } from './AddFoodPanel';
import { foodRegionOf } from './model';

export function AddFoodScreen({ onDone, date }: { onDone: () => void; date?: LocalDate }) {
  const repos = useRepos();
  const { clock } = usePlatform();
  const profile = useQuery({ queryKey: queryKeys.profile(), queryFn: () => repos.profile.get() });
  const region = foodRegionOf(profile.data);

  return (
    <Screen>
      <ScreenTitle>Add food</ScreenTitle>
      <ScreenBlurb>
        Say what you ate, type it out, or repeat something you have saved. All three write the same
        rows, so the day totals do not care which you use.
      </ScreenBlurb>

      <AddFoodPanel repos={repos} date={date ?? clock.today()} region={region} onLogged={onDone} />

      <Note>
        {region === 'generic'
          ? 'Set a food region in You → Profile and estimates start from the staples you actually eat.'
          : `Estimates use the ${region} staples set in your profile.`}
      </Note>
    </Screen>
  );
}
