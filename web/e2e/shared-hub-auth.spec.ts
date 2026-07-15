import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
    await page.route('**/api/auth/session', async (route) => {
        await route.fulfill({ status: 401, contentType: 'application/json', body: '{"code":"authentication_required"}' })
    })
})

test('shows Keycloak and invitation login without token fields', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByRole('button', { name: 'Sign in with Keycloak' })).toBeVisible()
    await expect(page.getByText('Have an invitation code?')).toBeVisible()
    await expect(page.getByPlaceholder('Enter invitation code')).not.toBeVisible()
    await expect(page.locator('input[name="token"]')).toHaveCount(0)

    await page.getByText('Have an invitation code?').click()
    await expect(page.getByPlaceholder('Enter invitation code')).toBeVisible()
})

test('submits invitation in a JSON body and follows the OIDC redirect', async ({ page }) => {
    let invitationBody: unknown = null
    await page.route('**/api/auth/login', async (route) => {
        invitationBody = route.request().postDataJSON()
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ redirectUrl: 'https://id.example.com/authorize' })
        })
    })
    await page.route('https://id.example.com/authorize', async (route) => {
        await route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>Identity provider</h1>' })
    })
    await page.goto('/')
    await page.getByText('Have an invitation code?').click()
    await page.getByPlaceholder('Enter invitation code').fill('invitation-secret')
    await page.getByRole('button', { name: 'Redeem invitation' }).click()

    await expect(page.getByRole('heading', { name: 'Identity provider' })).toBeVisible()
    expect(invitationBody).toEqual({ invitationToken: 'invitation-secret' })
    expect(page.url()).not.toContain('invitation-secret')
})
