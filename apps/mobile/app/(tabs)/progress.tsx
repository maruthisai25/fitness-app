import { Placeholder } from '../../src/Placeholder';
import { DESTINATIONS } from '../../src/destinations';

const destination = DESTINATIONS[3];

export default function ProgressScreen() {
  return <Placeholder title={destination.label} blurb={destination.blurb} />;
}
