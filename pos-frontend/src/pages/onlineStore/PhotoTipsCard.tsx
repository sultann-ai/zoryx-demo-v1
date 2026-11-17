import { Card } from "../../components/ui";

const TIPS = [
  "Take it in daylight, near a window. Switch the flash off.",
  "Put the dish on a plain, clean surface and wipe the rim of the plate.",
  "Get close and fill the frame — hold the phone just above the dish.",
  "Wide (landscape) photos work best. The website shows every photo 4:3, so keep the dish in the middle.",
  "One dish per photo. Keep hands, phones and clutter out of the picture.",
  "No text, logos, borders or filters on the photo.",
  "Best look: food with the background removed (PNG), on any plain background.",
  "Any size is fine — photos are shrunk on your phone before they upload.",
];

export function PhotoTipsCard() {
  return (
    <Card title="Photo tips">
      <ul className="flex list-disc flex-col gap-1.5 pl-5 text-body text-ink">
        {TIPS.map((tip) => (
          <li key={tip}>{tip}</li>
        ))}
      </ul>
    </Card>
  );
}
