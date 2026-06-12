import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../shared/ui";
import { CorrectionStatsContent } from "./components/CorrectionStats";
import { CorrectionHistoryContent } from "./components/CorrectionHistory";
import { SubmitCorrectionContent } from "./components/SubmitCorrection";

export function TunerPanel() {
  return (
    <Tabs defaultValue="stats" className="w-full">
      <TabsList className="mb-6">
        <TabsTrigger value="stats">Stats</TabsTrigger>
        <TabsTrigger value="history">History</TabsTrigger>
        <TabsTrigger value="submit">Submit</TabsTrigger>
      </TabsList>

      <TabsContent value="stats">
        <CorrectionStatsContent />
      </TabsContent>

      <TabsContent value="history">
        <CorrectionHistoryContent />
      </TabsContent>

      <TabsContent value="submit">
        <SubmitCorrectionContent />
      </TabsContent>
    </Tabs>
  );
}
