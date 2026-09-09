import { Placeholder } from '../../src/Placeholder';
import { DESTINATIONS } from '../../src/destinations';

const destination = DESTINATIONS[1];

export default function TrainScreen() {
  return <Placeholder title={destination.label} blurb={destination.blurb} />;
}
