import {Router} from 'itty-router';
import {customAlphabet} from 'nanoid';
import {getAssetFromKV} from '@cloudflare/kv-asset-handler';

const router = Router();
const nanoid = customAlphabet(
    '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
    6,
);

router.get('/:slug', async (request) => {
    let link = await SHORTEN.get(request.params.slug);

    if (link) {
        return new Response(null, {
            headers: {Location: link},
            status: 301,
        })
    } else {
        return new Response('Key not found', {
            status: 404,
        });
    }
});


router.post('/links', async (request) => {
    let requestBody = await request.json();
    let slug = requestBody.slug && requestBody.slug.trim() ? requestBody.slug : nanoid();

    // Check if the slug already exists
    let existingLink = await SHORTEN.get(slug);
    if (existingLink) {
        return new Response(JSON.stringify({message: 'Slug already in use'}), {
            headers: {'content-type': 'application/json'},
            status: 409, // Conflict
        });
    }

    if ('url' in requestBody) {
        await SHORTEN.put(slug, requestBody.url, {expirationTtl: 86400});
        let shortenedURL = `${new URL(request.url).origin}/${slug}`;

        let qrCodeURL = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(shortenedURL)}`;

        let responseBody = {
            message: 'Link shortened successfully',
            slug,
            shortened: shortenedURL,
            qrCodeURL: qrCodeURL,
        };

        return new Response(JSON.stringify(responseBody), {
            headers: {'content-type': 'application/json'},
            status: 200,
        });
    } else {
        return new Response('Must provide a valid URL', {status: 400});
    }
});

router.get('/generate-qr', async (request) => {
    const { searchParams } = new URL(request.url);
    const data = searchParams.get('data');

    if (!data) {
        return new Response('Missing data parameter', { status: 400 });
    }

    const qrCodeURL = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(data)}`;

    try {
        const qrResponse = await fetch(qrCodeURL);
        const blob = await qrResponse.blob();

        return new Response(blob, {
            headers: {
                'Content-Type': 'image/svg+xml',
            },
        });
    } catch (error) {
        console.error('Error fetching QR Code:', error);
        return new Response('Error fetching QR Code', { status: 500 });
    }
});


async function handleEvent(event) {
    let requestUrl = new URL(event.request.url);
    if (requestUrl.pathname === '/' || requestUrl.pathname.includes('static')) {
        return await getAssetFromKV(event);
    } else {
        return await router.handle(event.request);
    }
}

addEventListener('fetch', (event) => {
    event.respondWith(handleEvent(event));
});



