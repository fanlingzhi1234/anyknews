import { NewsBoard } from "@/components/news-board";
import { getBoardData } from "@/lib/board-service";

export const dynamic = "force-dynamic";

export default async function Home() {
  return <NewsBoard initialBoard={await getBoardData()} />;
}
