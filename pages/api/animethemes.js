export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { malIds } = req.body;

  if (!malIds || !Array.isArray(malIds) || malIds.length === 0) {
    return res.status(400).json({ error: 'malIds array is required' });
  }

  try {
    const themes = [];
    
    // Query animethemes.moe GraphQL API for each anime
    for (const malId of malIds) {
      try {
        const query = `
          query GetAnimeThemes($malId: Int!) {
            anime(where: { mappings: { externalSite: "myanimelist", externalId: $malId } }) {
              name
              slug
              themes {
                slug
                type
                sequence
                entries {
                  version
                  videos {
                    tags
                    link
                    basename
                  }
                }
              }
            }
          }
        `;

        const response = await fetch('https://api.animethemes.moe/api/graphql', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query,
            variables: { malId: parseInt(malId) }
          })
        });

        if (!response.ok) {
          console.error(`Failed to fetch themes for MAL ID ${malId}: ${response.statusText}`);
          continue;
        }

        const data = await response.json();
        
        if (data.errors) {
          console.error(`GraphQL errors for MAL ID ${malId}:`, data.errors);
          continue;
        }

        const anime = data.data?.anime?.[0];
        if (!anime) {
          continue;
        }

        // Get OP (Opening) themes, prefer first one
        const opThemes = anime.themes?.filter(t => t.type === 'OP') || [];
        if (opThemes.length > 0) {
          const theme = opThemes[0];
          const entry = theme.entries?.[0];
          const video = entry?.videos?.find(v => v.tags?.includes('720p') || v.tags?.includes('1080p')) || entry?.videos?.[0];
          
          if (video?.link) {
            themes.push({
              malId: parseInt(malId),
              animeName: anime.name,
              animeSlug: anime.slug,
              themeSlug: theme.slug,
              themeType: theme.type,
              videoUrl: video.link,
              basename: video.basename
            });
          }
        }
      } catch (error) {
        console.error(`Error fetching themes for MAL ID ${malId}:`, error);
        continue;
      }
    }

    return res.status(200).json({ themes });
  } catch (error) {
    console.error('Error in animethemes API:', error);
    return res.status(500).json({ error: 'Failed to fetch anime themes' });
  }
}

