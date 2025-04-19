/**
 * Google Sheets Service для интеграции с таблицей лидеров
 *
 * Для использования этого сервиса необходимо:
 * 1. Создать проект в Google Cloud Console
 * 2. Включить Google Sheets API
 * 3. Создать сервисный аккаунт и скачать JSON-ключ
 * 4. Создать таблицу Google Sheets и предоставить доступ сервисному аккаунту
 * 5. Установить пакеты: npm install googleapis
 */

import { google } from "googleapis";

// Интерфейс для записи в таблице лидеров
export interface LeaderboardEntry {
  nickname: string;
  score: number;
  timestamp?: string;
}

class GoogleSheetsService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private sheets: any; // Consider using a more specific type if available from googleapis
  private spreadsheetId: string;
  private range: string;

  constructor() {
    this.spreadsheetId = process.env.NEXT_PUBLIC_GOOGLE_SHEET_ID || "";
    this.range = "Leaderboard!A:C"; // A=nickname, B=score, C=timestamp
    if (!this.spreadsheetId) {
      console.warn(
        "NEXT_PUBLIC_GOOGLE_SHEET_ID environment variable is not set."
      );
    }
    this.initialize();
  }

  private initialize() {
    try {
      // Client-side: Use API key for read-only access
      if (typeof window !== "undefined") {
        const apiKey = process.env.NEXT_PUBLIC_GOOGLE_API_KEY;
        if (!apiKey) {
          console.warn(
            "NEXT_PUBLIC_GOOGLE_API_KEY is not set for client-side access."
          );
          return; // Cannot initialize without API key on client
        }
        this.sheets = google.sheets({
          version: "v4",
          auth: apiKey,
        });
      } else {
        // Server-side: Use service account for full access
        const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
        const key = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
        if (!email || !key) {
          console.error(
            "Google Sheets service account credentials (email or key) are missing."
          );
          return; // Cannot initialize without credentials on server
        }
        const auth = new google.auth.JWT({
          email,
          key,
          scopes: ["https://www.googleapis.com/auth/spreadsheets"],
        });
        this.sheets = google.sheets({ version: "v4", auth });
      }
    } catch (error) {
      console.error("Error initializing Google Sheets API client:", error);
    }
  }

  /**
   * Get leaderboard data
   */
  async getLeaderboard(): Promise<LeaderboardEntry[]> {
    if (!this.sheets) {
      console.error("Google Sheets API client not initialized.");
      return [];
    }
    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: this.range,
      });

      const rows = response.data.values || [];

      rows.shift();
      return (
        rows

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((row: any) => ({
            nickname: row[0] || "",
            score: parseInt(row[1]) || 0,
            timestamp: row[2] || "",
          }))
          .sort((a: LeaderboardEntry, b: LeaderboardEntry) => b.score - a.score)
      );
    } catch (error) {
      console.error(
        "Error fetching leaderboard data from Google Sheets:",
        error
      );
      return []; // Return empty array on error
    }
  }

  /**
   * Add a new entry to the leaderboard (server-side only)
   */
  async addScore(entry: LeaderboardEntry): Promise<boolean> {
    if (typeof window !== "undefined") {
      console.error("addScore can only be called from the server-side.");
      return false;
    }
    if (!this.sheets) {
      console.error("Google Sheets API client not initialized for writing.");
      return false;
    }
    try {
      const timestamp = new Date().toISOString();

      await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: this.range, // Append to the end of the specified range
        valueInputOption: "USER_ENTERED", // Interpret values as if typed into UI
        insertDataOption: "INSERT_ROWS", // Insert new rows for the data
        resource: {
          values: [[entry.nickname, entry.score.toString(), timestamp]],
        },
      });

      // console.log("Successfully added entry to spreadsheet"); // Removed debug log
      return true;
    } catch (error) {
      console.error("Error adding entry to Google Sheets:", error);
      return false;
    }
  }
}

// Create and export a singleton instance of the service
const googleSheetsService = new GoogleSheetsService();
export default googleSheetsService;
