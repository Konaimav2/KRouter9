import { getMachineId } from "@/shared/utils/machine";
import EndpointPageClient from "./endpoint/EndpointPageClient";

export default async function DashboardPage() {
  const machineId = await getMachineId();
  return (
    <div className="min-w-0 max-w-full overflow-x-clip">
      <EndpointPageClient machineId={machineId} />
    </div>
  );
}
