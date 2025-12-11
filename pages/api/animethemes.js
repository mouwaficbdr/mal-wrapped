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
        // Filter by external site (MAL) as per documentation: https://api-docs.animethemes.moe/graphql/examples/filter-by-external-site/
        // Try the documented query structure first
        const query = `
          query GetAnimeThemes($malId: Int!) {
            anime(
              where: {
                mappings: {
                  some: {
                    externalSite: {
                      name: {
                        eq: "myanimelist"
                      }
                    },
                    externalId: {
                      eq: $malId
                    }
                  }
                }
              }
            ) {
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

        let response = await fetch('https://api.animethemes.moe/api/graphql', {
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

        let responseText = await response.text();
        console.log(`Raw response for MAL ID ${malId}:`, responseText.substring(0, 500));

        let data;
        try {
          data = JSON.parse(responseText);
        } catch (e) {
          console.error(`Failed to parse JSON for MAL ID ${malId}:`, e);
          console.error('Response text:', responseText);
          continue;
        }
        
        // If there are errors, try alternative query structures
        if (data.errors) {
          console.error(`GraphQL errors for MAL ID ${malId}:`, JSON.stringify(data.errors, null, 2));
          
          // Try simpler query structure without nested eq operators
          console.log(`Trying simpler query structure for MAL ID ${malId}`);
          const altQuery1 = `
            query GetAnimeThemes($malId: Int!) {
              anime(
                where: {
                  mappings: {
                    some: {
                      externalSite: {
                        name: "myanimelist"
                      },
                      externalId: $malId
                    }
                  }
                }
              ) {
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
          
          response = await fetch('https://api.animethemes.moe/api/graphql', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
            body: JSON.stringify({
              query: altQuery1,
              variables: { malId: parseInt(malId) }
            })
          });
          
          if (response.ok) {
            responseText = await response.text();
            data = JSON.parse(responseText);
            if (!data.errors) {
              console.log(`Simpler query worked for MAL ID ${malId}`);
            } else {
              // Try even simpler structure
              console.log(`Trying direct mapping query for MAL ID ${malId}`);
              const altQuery2 = `
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
              
              response = await fetch('https://api.animethemes.moe/api/graphql', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Accept': 'application/json',
                },
                body: JSON.stringify({
                  query: altQuery2,
                  variables: { malId: parseInt(malId) }
                })
              });
              
              if (response.ok) {
                responseText = await response.text();
                data = JSON.parse(responseText);
                if (data.errors) {
                  console.error(`All query attempts failed for MAL ID ${malId}:`, data.errors);
                  continue;
                }
              } else {
                console.error(`Failed to fetch with alternative query for MAL ID ${malId}`);
                continue;
              }
            }
          } else {
            console.error(`Alternative query request failed for MAL ID ${malId}`);
            continue;
          }
        }

        console.log(`Response for MAL ID ${malId}:`, JSON.stringify(data.data, null, 2));
        
        // Handle both array and single object responses
        let animeArray = [];
        if (Array.isArray(data.data?.anime)) {
          animeArray = data.data.anime;
        } else if (data.data?.anime) {
          animeArray = [data.data.anime];
        }
        
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

