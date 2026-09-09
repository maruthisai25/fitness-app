import { Placeholder } from '../../src/Placeholder';
import { DESTINATIONS } from '../../src/destinations';

const destination = DESTINATIONS[0];

export default function TodayScreen() {
  return <Placeholder title={destination.label} blurb={destination.blurb} />;
}
