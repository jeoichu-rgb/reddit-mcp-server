import { chromium } from "playwright"
import fs from "fs"
import path from "path"

const AUTH_STATE_PATH = path.join(process.cwd(), "auth-state.json")

export class BrowserAuth {
  private cookieHeader: string | null = null

  async login(username: string, password: string): Promise<void> {
    const browser = await chromium.launch({ headless: true })
    const context = await browser.newContext()
    const page = await context.newPage()

    await page.goto("https://old.reddit.com/login")
    await page.fill('input[name="user"]', username)
    await page.fill('input[name="passwd"]', password)
    await page.click('#login-form button[type="submit"]')
    await page.waitForURL("**/reddit.com/**", { timeout: 15000 })

    const state = await context.storageState()
    fs.writeFileSync(AUTH_STATE_PATH, JSON.stringify(state, null, 2))
    this.cookieHeader = null

    await browser.close()
    console.error("[BrowserAuth] Login successful, cookies saved")
  }

  getCookieHeader(): string | null {
    if (this.cookieHeader !== null) return this.cookieHeader

    if (!fs.existsSync(AUTH_STATE_PATH)) return null

    try {
      const state = JSON.parse(fs.readFileSync(AUTH_STATE_PATH, "utf-8"))
      const cookies = state.cookies ?? []
      const redditCookies = cookies.filter((c: { domain: string }) => c.domain.includes("reddit.com"))
      if (redditCookies.length === 0) return null

      this.cookieHeader = redditCookies.map((c: { name: string; value: string }) => `${c.name}=${c.value}`).join("; ")
      return this.cookieHeader
    } catch {
      return null
    }
  }

  async getModhash(): Promise<string | null> {
    const cookie = this.getCookieHeader()
    if (cookie === null) return null

    try {
      const response = await fetch("https://www.reddit.com/api/me.json", {
        headers: {
          Cookie: cookie,
          "User-Agent": "typescript:reddit-mcp-server:browser (by /u/erik)",
        },
      })
      if (!response.ok) return null
      const data = (await response.json()) as { data?: { modhash?: string } }
      return data.data?.modhash ?? null
    } catch {
      return null
    }
  }

  hasAuth(): boolean {
    return fs.existsSync(AUTH_STATE_PATH) && this.getCookieHeader() !== null
  }

  clearAuth(): void {
    if (fs.existsSync(AUTH_STATE_PATH)) {
      fs.unlinkSync(AUTH_STATE_PATH)
    }
    this.cookieHeader = null
  }

  invalidateCache(): void {
    this.cookieHeader = null
  }
}

export const browserAuth = new BrowserAuth()
