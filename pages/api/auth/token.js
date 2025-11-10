export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { code, code_verifier, redirect_uri } = req.body;

  // Validate required parameters
  if (!code || !code_verifier || !redirect_uri) {
    return res.status(400).json({ 
      error: 'Missing required parameters',
      required: ['code', 'code_verifier', 'redirect_uri']
    });
  }

  const CLIENT_ID = process.env.NEXT_PUBLIC_MAL_CLIENT_ID;
  
  // Validate CLIENT_ID
  if (!CLIENT_ID) {
    console.error('CLIENT_ID is not set in environment variables');
    return res.status(500).json({ 
      error: 'Server configuration error',
      error_description: 'CLIENT_ID is not configured. Please set NEXT_PUBLIC_MAL_CLIENT_ID in Vercel environment variables.',
      message: 'CLIENT_ID is not configured'
    });
  }
  
  if (CLIENT_ID === '<your_client_id_here>' || CLIENT_ID.trim() === '') {
    console.error('CLIENT_ID is set but has invalid value');
    return res.status(500).json({ 
      error: 'Server configuration error',
      error_description: 'CLIENT_ID is set but has an invalid value. Please set a valid CLIENT_ID in Vercel environment variables.',
      message: 'CLIENT_ID has invalid value'
    });
  }
  
  // Log that CLIENT_ID is set (but don't log the actual value for security)
  console.log('CLIENT_ID is set, length:', CLIENT_ID.length);

  try {
    const tokenUrl = 'https://myanimelist.net/v1/oauth2/token';
    
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        code,
        code_verifier,
        grant_type: 'authorization_code',
        redirect_uri,
      }),
    });

    // Parse response
    let data;
    const responseText = await response.text();
    console.log('MAL API response status:', response.status);
    console.log('MAL API response length:', responseText ? responseText.length : 0);
    console.log('MAL API response preview:', responseText ? responseText.substring(0, 200) : '(empty)');
    
    // Handle empty responses
    if (!responseText || responseText.trim() === '') {
      console.error('Empty response from MAL API');
      
      // Provide specific error messages based on status code
      if (response.status === 401) {
        return res.status(401).json({
          error: 'unauthorized',
          error_description: 'MAL API returned 401 Unauthorized. This usually means:\n1. Invalid CLIENT_ID\n2. The authorization code has expired\n3. The CLIENT_ID does not match your MAL app settings\n\nPlease verify:\n- NEXT_PUBLIC_MAL_CLIENT_ID is set correctly in Vercel\n- The Client ID matches your MAL app at https://myanimelist.net/apiconfig\n- You have redeployed after setting the environment variable',
          message: 'Authentication failed - 401 Unauthorized'
        });
      } else if (response.status === 400) {
        return res.status(400).json({
          error: 'bad_request',
          error_description: `MAL API returned 400 Bad Request. Possible causes:\n1. Invalid authorization code\n2. Redirect URI mismatch (expected: ${redirect_uri})\n3. Invalid code_verifier\n\nPlease verify your redirect URI in MAL app settings matches exactly.`,
          message: 'Bad request - check redirect URI and authorization code'
        });
      } else {
        return res.status(response.status || 500).json({
          error: 'empty_response',
          error_description: `MAL API returned ${response.status} with empty response body`,
          message: 'No data received from MAL API'
        });
      }
    }
    
    // Try to parse as JSON
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      console.error('Failed to parse MAL API response as JSON:', responseText);
      return res.status(500).json({
        error: 'invalid_response',
        error_description: 'MAL API returned an invalid response format',
        message: 'Failed to parse response from MAL API',
        rawResponse: responseText.substring(0, 500)
      });
    }

    if (!response.ok) {
      console.error('MAL API error:', {
        status: response.status,
        error: data.error,
        error_description: data.error_description,
        fullResponse: data
      });
      
      // Provide more helpful error messages
      let errorDescription = data.error_description || 'Unknown error';
      
      if (data.error === 'invalid_client') {
        errorDescription = 'Invalid CLIENT_ID. Please verify that NEXT_PUBLIC_MAL_CLIENT_ID is set correctly in Vercel environment variables and matches your MAL app Client ID exactly.';
      } else if (data.error === 'invalid_grant') {
        errorDescription = 'Invalid authorization code. The code may have expired or was already used. Please try connecting again.';
      } else if (data.error === 'redirect_uri_mismatch') {
        errorDescription = `Redirect URI mismatch. Make sure your MAL app redirect URI is set exactly to: ${redirect_uri}\n\nNote: The redirect URI must match exactly, including:\n- Protocol (http/https)\n- Domain\n- Port (if any)\n- Path\n- Trailing slash (or lack thereof)`;
      } else if (response.status === 401) {
        errorDescription = 'Unauthorized. This could mean:\n1. Invalid CLIENT_ID\n2. Expired authorization code\n3. CLIENT_ID does not match MAL app settings';
      }
      
      return res.status(response.status).json({
        error: data.error || 'token_exchange_failed',
        error_description: errorDescription,
        details: data,
        redirect_uri_used: redirect_uri
      });
    }

    // Validate that we got a token
    if (!data.access_token) {
      console.error('No access_token in successful response:', data);
      return res.status(500).json({
        error: 'no_token',
        error_description: 'MAL API did not return an access token',
        message: 'Token exchange appeared successful but no access_token was returned',
        details: data
      });
    }

    console.log('Token exchange successful, token length:', data.access_token.length);
    console.log('Token type:', data.token_type);
    console.log('Expires in:', data.expires_in);

    // Return the token to the client
    return res.status(200).json(data);
  } catch (error) {
    console.error('Token exchange error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}

