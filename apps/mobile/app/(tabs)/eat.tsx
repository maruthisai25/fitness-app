import { Placeholder } from '../../src/Placeholder';
import { DESTINATIONS } from '../../src/destinations';

const destination = DESTINATIONS[2];

export default function EatScreen() {
  return <Placeholder title={destination.label} blurb={destination.blurb} />;
}
