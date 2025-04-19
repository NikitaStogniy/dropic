import { NextRequest, NextResponse } from "next/server";
import googleSheetsService, {
  LeaderboardEntry,
} from "@/app/utils/googleSheetsService";

// Helper function to add CORS headers
function corsHeaders(response: NextResponse) {
  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type");
  return response;
}

// Handle OPTIONS requests for CORS preflight
export async function OPTIONS() {
  return corsHeaders(NextResponse.json({}, { status: 200 }));
}

/**
 * GET: Получение таблицы лидеров
 */
export async function GET() {
  try {
    const leaderboard = await googleSheetsService.getLeaderboard();
    return corsHeaders(NextResponse.json({ leaderboard }, { status: 200 }));
  } catch (error) {
    console.error("Ошибка при получении таблицы лидеров:", error);
    return corsHeaders(
      NextResponse.json(
        { error: "Не удалось получить таблицу лидеров" },
        { status: 500 }
      )
    );
  }
}

/**
 * POST: Добавление новой записи в таблицу лидеров
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Проверяем наличие необходимых полей
    if (!body.nickname || typeof body.score !== "number") {
      console.error("Invalid request, missing nickname or score:", body);
      return corsHeaders(
        NextResponse.json(
          { error: "Требуются поля nickname и score" },
          { status: 400 }
        )
      );
    }

    const entry: LeaderboardEntry = {
      nickname: body.nickname.substring(0, 5).toUpperCase(),
      score: body.score,
    };

    const success = await googleSheetsService.addScore(entry);

    if (success) {
      return corsHeaders(NextResponse.json({ success: true }, { status: 201 }));
    } else {
      console.error("Failed to add score");
      return corsHeaders(
        NextResponse.json(
          { error: "Не удалось добавить запись" },
          { status: 500 }
        )
      );
    }
  } catch (error) {
    console.error("Ошибка при добавлении записи в таблицу лидеров:", error);
    return corsHeaders(
      NextResponse.json(
        { error: "Не удалось обработать запрос" },
        { status: 500 }
      )
    );
  }
}
