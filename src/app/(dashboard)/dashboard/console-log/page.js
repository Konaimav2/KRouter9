import ConsoleLogClient from "./ConsoleLogClient";
import HeadroomSetupButton from "./HeadroomSetupButton";

// Force dynamic so Next.js standalone build includes the server-side JS file
export const dynamic = "force-dynamic";

export default function ConsoleLogPage() {
  return (
    <div className="space-y-4">
      <HeadroomSetupButton />
      <ConsoleLogClient />
    </div>
  );
}
