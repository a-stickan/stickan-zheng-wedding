// @ts-check
import { expect, test } from '@playwright/test';

test('renders the core wedding sections', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle(/Angela & Aidan Wedding/);
  await expect(page.getByRole('heading', { name: 'Angela & Aidan' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Atlanta Botanical Garden' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'The Capital Grille' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Planning for Atlanta' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Cocktail Attire' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Gift Details' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Moments Together' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Let Us Know' })).toBeVisible();
});

test('shows the reception details and map link', async ({ page }) => {
  await page.goto('/');

  const reception = page.locator('#reception');
  await expect(reception.getByText('Friday, October 16, 2026')).toBeVisible();
  await expect(reception.getByText('6:00–9:00 PM')).toBeVisible();
  await expect(reception.getByRole('heading', { name: '255 East Paces Ferry Rd NE, Atlanta, GA 30305' })).toBeVisible();
  await expect(reception.getByText('Please contact us if you need parking information.')).toBeVisible();

  const mapLink = reception.getByRole('link', { name: 'View on Google Maps' });
  await expect(mapLink).toHaveAttribute('href', /google\.com\/maps\/place\/The\+Capital\+Grille/);
  await expect(mapLink).toHaveAttribute('target', '_blank');
  await expect(mapLink).toHaveAttribute('rel', 'noopener noreferrer');

  const calendarLink = reception.getByRole('link', { name: 'Add reception to calendar' });
  const calendarHref = await calendarLink.getAttribute('href');
  if (!calendarHref) {
    throw new Error('Reception calendar link is missing an href.');
  }
  const calendarUrl = new URL(calendarHref);
  expect(calendarUrl.searchParams.get('text')).toBe("Angela & Aidan's Wedding Reception");
  expect(calendarUrl.searchParams.get('dates')).toBe('20261016T220000Z/20261017T010000Z');
  expect(calendarUrl.searchParams.get('details')).toBe('Our wedding reception at The Capital Grille');
  expect(calendarUrl.searchParams.get('location')).toBe('The Capital Grille, 255 East Paces Ferry Rd NE, Atlanta, GA 30305, USA');
  await expect(calendarLink).toHaveAttribute('target', '_blank');
  await expect(calendarLink).toHaveAttribute('rel', 'noopener noreferrer');
});

test('links the ceremony to the Atlanta Botanical Garden map listing', async ({ page }) => {
  await page.goto('/');

  const mapLink = page.locator('#ceremony').getByRole('link', { name: 'View on Google Maps' });
  await expect(mapLink).toHaveAttribute('href', /google\.com\/maps\/place\/Atlanta\+Botanical\+Garden/);
});

test('all page image references are reachable', async ({ page, request }) => {
  await page.goto('/');

  const imageUrls = await page.locator('img').evaluateAll((images) =>
    images.map((image) => /** @type {HTMLImageElement} */ (image).src),
  );

  expect(imageUrls.length).toBeGreaterThan(0);

  for (const imageUrl of imageUrls) {
    const response = await request.get(imageUrl);
    expect(response.ok(), imageUrl).toBeTruthy();
  }
});

test('narrow photo disclosures reveal optional gallery images', async ({ page }) => {
  const viewport = page.viewportSize();
  test.skip(!viewport || viewport.width >= 640, 'Narrow gallery controls are hidden on larger screens.');

  await page.goto('/');

  const venueDisclosure = page.locator('details').filter({ hasText: 'View more venue photos ↓' });
  const venueToggle = venueDisclosure.locator('summary');
  await expect(venueToggle).toBeVisible();
  await expect(venueDisclosure).not.toHaveAttribute('open', '');
  await expect(venueDisclosure.locator('[data-photo-extra="venue"]')).toHaveCount(4);

  await venueToggle.click();
  await expect(venueDisclosure).toHaveAttribute('open', '');
  const venueButtonBox = await venueToggle.boundingBox();
  const firstVenueExtraBox = await venueDisclosure.locator('[data-photo-extra="venue"]').first().boundingBox();
  expect(firstVenueExtraBox?.y).toBeGreaterThan(venueButtonBox?.y ?? 0);

  const coupleDisclosure = page.locator('details').filter({ hasText: 'View more photos ↓' });
  const coupleToggle = coupleDisclosure.locator('summary');
  await expect(coupleToggle).toBeVisible();
  await expect(coupleDisclosure).not.toHaveAttribute('open', '');
  await expect(coupleDisclosure.locator('[data-photo-extra="couple"]')).toHaveCount(2);

  await coupleToggle.click();
  await expect(coupleDisclosure).toHaveAttribute('open', '');
  const coupleButtonBox = await coupleToggle.boundingBox();
  const firstCoupleExtraBox = await coupleDisclosure.locator('[data-photo-extra="couple"]').first().boundingBox();
  expect(firstCoupleExtraBox?.y).toBeGreaterThan(coupleButtonBox?.y ?? 0);
});

test('wide layouts show full galleries without expand buttons', async ({ page }) => {
  const viewport = page.viewportSize();
  test.skip(!viewport || viewport.width < 640, 'Wide gallery behavior only.');

  await page.goto('/');

  await expect(page.locator('summary').filter({ hasText: 'View more venue photos ↓' })).toBeHidden();
  await expect(page.locator('summary').filter({ hasText: 'View more photos ↓' })).toBeHidden();
  await expect(page.locator('img[src$="garden-pool.JPG"]:visible')).toHaveCount(1);
  await expect(page.locator('img[src$="greenhouse-canopy.JPG"]:visible')).toHaveCount(2);
  await expect(page.locator('img[src$="frog-exhibit.JPG"]:visible')).toHaveCount(1);
  await expect(page.locator('img[src$="engagement-photo.JPG"]:visible')).toHaveCount(1);
  await expect(page.locator('img[src$="grad-photo.JPG"]:visible')).toHaveCount(1);
  await expect(page.locator('img[src$="seattle-photo.jpg"]:visible')).toHaveCount(1);
});
