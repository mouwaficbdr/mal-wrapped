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
        // Query animethemes.moe GraphQL API
        // Try different query structures - the mapping might need different syntax
        const query = `
          query GetAnimeThemes($malId: Int!) {
            anime(where: { mappings: { some: { externalSite: "myanimelist", externalId: $malId } } }) {
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
        
        console.log(`Fetching themes for MAL ID: ${malId}`);

        const response = await fetch('https://api.animethemes.moe/api/graphql', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
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

        const responseText = await response.text();
        console.log(`Raw response for MAL ID ${malId}:`, responseText.substring(0, 500));

        let data;
        try {
          data = JSON.parse(responseText);
        } catch (e) {
          console.error(`Failed to parse JSON for MAL ID ${malId}:`, e);
          console.error('Response text:', responseText);
          continue;
        }
        
        if (data.errors) {
          console.error(`GraphQL errors for MAL ID ${malId}:`, JSON.stringify(data.errors, null, 2));
          // Try alternative query structure if first one fails
          if (data.errors.some(e => e.message?.includes('mappings'))) {
            console.log(`Trying alternative query structure for MAL ID ${malId}`);
            const altQuery = `
              query GetAnimeThemes($malId: Int!) {
                anime(where: { mappings: { externalSite: "myanimelist", externalId: $malId } }) {
                  name
                  slug
                  themes {
                    slug
                    type
                    entries {
                      videos {
                        link
                        basename
                        tags
                      }
                    }
                  }
                }
              }
            `;
            const altResponse = await fetch('https://api.animethemes.moe/api/graphql', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
              },
              body: JSON.stringify({
                query: altQuery,
                variables: { malId: parseInt(malId) }
              })
            });
            if (altResponse.ok) {
              const altText = await altResponse.text();
              data = JSON.parse(altText);
              if (data.errors) {
                console.error(`Alternative query also failed for MAL ID ${malId}:`, data.errors);
                continue;
              }
            }
          } else {
            continue;
          }
        }

        console.log(`Response for MAL ID ${malId}:`, JSON.stringify(data.data, null, 2));
        
        const animeArray = data.data?.anime || [];
        if (animeArray.length === 0) {
          console.log(`No anime found for MAL ID ${malId}`);
          continue;
        }
        
        const anime = animeArray[0];
        console.log(`Found anime: ${anime.name}, themes count: ${anime.themes?.length || 0}`);

        // Get OP (Opening) themes, prefer first one
        const opThemes = anime.themes?.filter(t => t.type === 'OP') || [];
        console.log(`OP themes found: ${opThemes.length}`);
        
        if (opThemes.length > 0) {
          const theme = opThemes[0];
          const entry = theme.entries?.[0];
          
          if (!entry) {
            console.log(`No entries found for theme ${theme.slug}`);
            continue;
          }
          
          console.log(`Entry videos count: ${entry.videos?.length || 0}`);
          
          // Try to find audio file first, then fallback to video
          const audioFile = entry?.videos?.find(v => 
            v.tags?.includes('audio') || 
            v.basename?.includes('.mp3') || 
            v.basename?.includes('.m4a') ||
            v.basename?.includes('.ogg')
          );
          
          const video = audioFile || 
            entry?.videos?.find(v => v.tags?.includes('720p') || v.tags?.includes('1080p')) || 
            entry?.videos?.[0];
          
          if (video?.link) {
            console.log(`Adding theme for ${anime.name}: ${video.link}`);
            themes.push({
              malId: parseInt(malId),
              animeName: anime.name,
              animeSlug: anime.slug,
              themeSlug: theme.slug,
              themeType: theme.type,
              videoUrl: video.link,
              basename: video.basename,
              isAudio: !!audioFile
            });
          } else {
            console.log(`No video link found for ${anime.name}`);
          }
        } else {
          console.log(`No OP themes found for ${anime.name}`);
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

