import { chromium } from "playwright"
import fs from "fs"
import path from "path"

const AUTH_STATE_PATH = path.join(process.cwd(), "auth-state.json")

export class BrowserAuth {
  private cookieHeader: string | null = null
  private modhash: string | null = null

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
      const raw = JSON.parse(fs.readFileSync(AUTH_STATE_PATH, "utf-8"))

      // Support both Cookie Editor export format (plain array) and Playwright storageState format ({cookies: [...]})
      const cookies: Array<{ domain: string; name: string; value: string }> = Array.isArray(raw) ? raw : (raw.cookies ?? [])

      const redditCookies = cookies.filter((c) => c.domain.includes("reddit.com"))
      if (redditCookies.length === 0) return null

      this.cookieHeader = redditCookies.map((c) => `${c.name}=${c.value}`).join("; ")
      return this.cookieHeader
    } catch {
      return null
    }
  }

  async getModhash(): Promise<string | null> {
    if (this.modhash !== null) return this.modhash

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
      this.modhash = data.data?.modhash ?? null
      return this.modhash
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
    this.modhash = null
  }
}

export const browserAuth = new BrowserAuth()
