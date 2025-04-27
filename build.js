#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const http = require('http');
const markdown = require('./markdown');

// Fix paths to be relative to the current file location
const contentDir = path.join(__dirname, 'src/content');
const outputDir = path.join(__dirname, 'site');  // Changed from 'dist' to 'site'
const templateDir = path.join(__dirname, 'src/templates');
const stylesDir = path.join(__dirname, 'src/styles'); // Add this line
const assetsDir = path.join(__dirname, 'src/assets'); // Add this line

function replaceVariables(template, variables) {
    return Object.keys(variables).reduce((result, key) => {
        return result.replace(new RegExp(`{{${key}}}`, 'g'), variables[key]);
    }, template);
}

function startServer() {
    const server = http.createServer((req, res) => {
        let url = req.url;
        
        // Handle URLs without file extensions by attempting to serve as .html
        if (!path.extname(url) && !url.endsWith('/')) {
            url += '/';
        }
        
        // Handle URLs ending with a slash by attempting to serve index.html
        if (url.endsWith('/')) {
            url += 'index.html';
        }
        
        let filePath = path.join(outputDir, url === '/' ? 'index.html' : url);
        
        console.log(`Requested: ${req.url} => File path: ${filePath}`);
        
        fs.readFile(filePath, (err, data) => {
            if (err) {
                // Try with .html extension if file not found and no extension provided
                if (!path.extname(req.url)) {
                    const htmlFilePath = path.join(outputDir, `${req.url}.html`);
                    fs.readFile(htmlFilePath, (htmlErr, htmlData) => {
                        if (htmlErr) {
                            res.writeHead(404);
                            res.end('File not found');
                            console.log(`404 Not Found: ${filePath} (also tried ${htmlFilePath})`);
                            return;
                        }
                        res.writeHead(200, { 'Content-Type': 'text/html' });
                        res.end(htmlData);
                        console.log(`200 OK: ${htmlFilePath}`);
                    });
                    return;
                }
                
                res.writeHead(404);
                res.end('File not found');
                console.log(`404 Not Found: ${filePath}`);
                return;
            }

            const ext = path.extname(filePath);
            const contentType = {
                '.html': 'text/html',
                '.css': 'text/css',
                '.js': 'text/javascript',
                '.png': 'image/png',
                '.jpg': 'image/jpeg',
            }[ext] || 'text/plain';

            res.writeHead(200, { 'Content-Type': contentType });
            res.end(data);
            console.log(`200 OK: ${filePath}`);
        });
    });

    const PORT = 1717;
    server.listen(PORT, () => {
        console.log(`\nServer running at http://localhost:${PORT}`);
        console.log('Press Ctrl+C to stop the server');
    });
}

function build() {
    // Create output directory if it doesn't exist
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    // Read templates
    const indexTemplate = fs.readFileSync(path.join(templateDir, 'index.html'), 'utf-8');
    const headerHTML = fs.readFileSync(path.join(templateDir, 'header.html'), 'utf8');
    const footerTemplate = fs.readFileSync(path.join(templateDir, 'footer.html'), 'utf8');
    const menuTemplate = fs.readFileSync(path.join(templateDir, 'menu.html'), 'utf8');
    const gameTemplate = fs.readFileSync(path.join(templateDir, 'game.html'), 'utf8');
    
    // Read the index.md file to extract sections and content
    const indexMdPath = path.join(contentDir, 'index.md');
    const indexMdContent = fs.readFileSync(indexMdPath, 'utf-8');
    
    // Parse frontmatter from index.md
    const frontmatterRegex = /^---[\r\n]+([\s\S]*?)[\r\n]+---/;
    const match = indexMdContent.match(frontmatterRegex);
    let frontmatter = {};
    let markdownContent = indexMdContent;
    
    if (match) {
        // Simple key-value parsing for the title
        frontmatter = match[1].split('\n').reduce((acc, line) => {
            line = line.trim();
            if (!line) return acc;
            
            // Handle key-value pairs
            const colonIndex = line.indexOf(':');
            if (colonIndex !== -1) {
                const key = line.slice(0, colonIndex).trim();
                const value = line.slice(colonIndex + 1).trim();
                acc[key] = value.replace(/^["'](.*)["']$/, '$1');
            }
            return acc;
        }, {});
        
        // Get content after frontmatter
        markdownContent = indexMdContent.replace(frontmatterRegex, '');
    }
    
    // Split content by H1 headers to get section content
    const sectionRegex = /(^|\n)# ([^\n]+)([^\n]*(?:\n(?!# )[^\n]*)*)/g;
    const sections = [];
    let match2;
    
    // No more section backgrounds from frontmatter - will alternate automatically
    
    while ((match2 = sectionRegex.exec(markdownContent)) !== null) {
        const title = match2[2].trim();
        const content = match2[3].trim();
        
        // Convert the title to an id (lowercase, spaces to dashes)
        const id = title.toLowerCase().replace(/\s+us$/i, '').replace(/\s+/g, '');
        
        // Alternate background based on position in sections array
        const background = sections.length % 2 === 0 ? 'light' : 'dark';
        
        // Handle contacts section specially if it has frontmatter
        if (id === 'contacts' && content.includes('---\ncontacts:')) {
            const contactsMatch = content.match(/---\s*\ncontacts:\s*([\s\S]*?)\s*\n---/);
            if (contactsMatch) {
                const contactsList = contactsMatch[1]
                    .split('\n')
                    .map(line => line.trim())
                    .filter(line => line.startsWith('- '))
                    .map(line => line.slice(2));
                
                const contactsHtml = `<h1>${title}</h1>
                    <div class="store-links">
                        <div class="store-links-wrapper">
                            ${markdown.convert(contactsList.join(' ')).replace(/src="([^\/].*?\.png)"/g, 'src="/assets/$1"')}
                        </div>
                    </div>`;
                
                sections.push({
                    id,
                    background,
                    content: contactsHtml
                });
            }
        } else if (id === 'games') {
            // Process project files for Games section
            const gamesDir = path.join(contentDir, 'games');
            let gamesHTML = `<h1>${title}</h1>`;
            
            if (fs.existsSync(gamesDir)) {
                const gameFiles = fs.readdirSync(gamesDir);
                
                // Collect all game data first
                const games = gameFiles.map(file => {
                    const gameContent = fs.readFileSync(path.join(gamesDir, file), 'utf-8');
                    const normalizedContent = gameContent.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
                    
                    // Parse frontmatter
                    const frontmatterRegex = /^---[\r\n]+([\s\S]*?)[\r\n]+---/;
                    const match = normalizedContent.match(frontmatterRegex);
                    const frontmatter = match ? match[1].split('\n').reduce((acc, line) => {
                        line = line.trim();
                        if (!line) return acc;
                        
                        if (line.startsWith('-')) {
                            // Handle array items
                            const value = line.slice(1).trim();
                            const lastKey = Object.keys(acc).pop();
                            if (!acc[lastKey]) {
                                acc[lastKey] = [];
                            }
                            acc[lastKey].push(value);
                        } else {
                            // Handle key-value pairs
                            const colonIndex = line.indexOf(':');
                            if (colonIndex !== -1) {
                                const key = line.slice(0, colonIndex).trim();
                                const value = line.slice(colonIndex + 1).trim();
                                acc[key] = value.replace(/^["'](.*)["']$/, '$1');
                            }
                        }
                        return acc;
                    }, {}) : {};

                    const gameName = path.basename(file, '.md');
                    return {
                        name: gameName,
                        frontmatter,
                        order: parseInt(frontmatter.order) || Infinity // Use Infinity for games without order
                    };
                });

                // Sort games by order parameter
                games.sort((a, b) => a.order - b.order);

                const gameGridHTML = games.map(game => {
                    return `
                        <div class="game">
                            <a href="/games/${game.name}/">
                                <img src="/assets/${game.frontmatter.preview_image}" alt="${game.name}">
                            </a>
                        </div>
                    `;
                }).join('\n');
                
                gamesHTML += `<div class="games-grid">${gameGridHTML}</div>`;
            }
            
            sections.push({
                id,
                background,
                content: gamesHTML
            });
        } else {
            // For other sections, just convert markdown to HTML
            sections.push({
                id,
                background,
                content: `<h1>${title}</h1>${markdown.convert(content)}`
            });
        }
    }
    
    // Build index page with sections
    const indexHTML = replaceVariables(indexTemplate, {
        title: frontmatter.title || 'Game Studio',
        header: headerHTML,
        menu: menuTemplate.replace(/{{#if isProject}}(.*?){{\/if}}/g, ''),
        sections: JSON.stringify(sections)
            .replace(/"content":"(.*?)"/g, function(match, p1) {
                return `"content":${JSON.stringify(p1)}`;
            })
    });
    
    // Replace {{#each sections}}...{{/each}} with the actual section HTML
    const eachSectionsRegex = /{{#each sections}}([\s\S]*?){{\/each}}/;
    const sectionTemplate = indexHTML.match(eachSectionsRegex)[1];
    const sectionsHTML = sections.map(section => {
        return sectionTemplate
            .replace(/{{this\.id}}/g, section.id)
            .replace(/{{this\.background}}/g, section.background)
            .replace(/{{this\.content}}/g, section.content);
    }).join('\n');
    
    const finalIndexHTML = indexHTML.replace(eachSectionsRegex, sectionsHTML);
    
    fs.writeFileSync(path.join(outputDir, 'index.html'), finalIndexHTML);
    
    // Process project files
    const gamesDir = path.join(contentDir, 'games');
    if (fs.existsSync(gamesDir)) {
        const gameFiles = fs.readdirSync(gamesDir);
        
        gameFiles.forEach(file => {
            const gameName = path.basename(file, '.md');
            
            // Read and parse project content
            const gameContent = fs.readFileSync(path.join(gamesDir, file), 'utf-8');
            const normalizedContent = gameContent.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
            
            // Parse frontmatter
            const frontmatterRegex = /^---[\r\n]+([\s\S]*?)[\r\n]+---/;
            const match = normalizedContent.match(frontmatterRegex);
            const frontmatter = match ? match[1].split('\n').reduce((acc, line) => {
                line = line.trim();
                if (!line) return acc;
                
                if (line.startsWith('-')) {
                    const value = line.slice(1).trim();
                    const lastKey = Object.keys(acc).pop();
                    if (!acc[lastKey]) {
                        acc[lastKey] = [];
                    }
                    acc[lastKey].push(value);
                } else {
                    const colonIndex = line.indexOf(':');
                    if (colonIndex !== -1) {
                        const key = line.slice(0, colonIndex).trim();
                        const value = line.slice(colonIndex + 1).trim();
                        acc[key] = value.replace(/^["'](.*)["']$/, '$1');
                    }
                }
                return acc;
            }, {}) : {};

            const mediaItems = Array.isArray(frontmatter.media) ? frontmatter.media : [];
            let mediaHTML = '';
            
            mediaItems.forEach(url => {
                if (url.includes('youtube.com')) {
                    mediaHTML += `
                        <div class="game media-item">
                            <div class="media-overlay" data-media-type="video" data-media-url="${url.replace('watch?v=', 'embed/')}"></div>
                            <iframe src="${url.replace('watch?v=', 'embed/')}" frameborder="0" allowfullscreen></iframe>
                        </div>`;
                } else {
                    mediaHTML += `
                        <div class="game media-item">
                            <div class="media-overlay" data-media-type="image" data-media-url="/assets/${url}"></div>
                            <img src="/assets/${url}" alt="Screenshot">
                        </div>`;
                }
            });
            
            const storeLinks = Array.isArray(frontmatter.store) ? frontmatter.store : [];
            let storeLinksHTML = '';
            
            if (storeLinks.length > 0) {
                // Fix image references to ensure they point to assets directory
                const fixedStoreLinks = storeLinks.map(store => 
                    store.replace(/!\[\]\(([^\/].*?\.png)\)/g, '![](/assets/$1)')
                ).join(' ');
                
                storeLinksHTML = `<div class="store-links-wrapper">${markdown.convert(fixedStoreLinks)}</div>`;
            }
            
            // Replace variables in project template
            const gameHTML = replaceVariables(gameTemplate, {
                title: frontmatter.title || gameName,
                header: headerHTML,
                menu: menuTemplate.replace(/{{#if isProject}}/g, '').replace(/{{\/if}}/g, ''),
                title_block: frontmatter.title ? `<h1>${frontmatter.title}</h1>` : '',
                release_block: frontmatter.release_data ? `<div class="release-date">Release date: ${frontmatter.release_data}</div>` : '',
                store_block: storeLinksHTML,
                description_block: frontmatter.description ? `<div class="description">${markdown.convert(frontmatter.description)}</div>` : '',
                media_block: mediaHTML ? `<div class="media-grid games-grid">${mediaHTML}</div>` : '',
                footer: footerTemplate
            });
            
            // Create games directory if it doesn't exist
            const gamesOutputDir = path.join(outputDir, 'games');
            if (!fs.existsSync(gamesOutputDir)) {
                fs.mkdirSync(gamesOutputDir, { recursive: true });
            }
            
            // Create project-specific directory
            const gameOutputDir = path.join(gamesOutputDir, gameName);
            if (!fs.existsSync(gameOutputDir)) {
                fs.mkdirSync(gameOutputDir, { recursive: true });
            }
            
            // Write project HTML file
            fs.writeFileSync(path.join(gameOutputDir, 'index.html'), gameHTML);
        });
    }
    
    // Process special pages with permalinks
    const specialPageFiles = [];
    
    // Read markdown files for special pages
    fs.readdirSync(contentDir).forEach(file => {
        if (!file.endsWith('.md') || file === 'index.md') return; // Skip index.md and non-markdown files
        
        const content = fs.readFileSync(path.join(contentDir, file), 'utf-8');
        
        // Parse frontmatter
        const frontmatterRegex = /^---[\r\n]+([\s\S]*?)[\r\n]+---/;
        const match = content.match(frontmatterRegex);
        let frontmatter = {};
        let markdownContent = content;
        
        if (match) {
            frontmatter = match[1].split('\n').reduce((acc, line) => {
                line = line.trim();
                if (!line) return acc;
                
                if (line.startsWith('-')) {
                    // Handle array items
                    const value = line.slice(1).trim();
                    const lastKey = Object.keys(acc).pop();
                    if (!acc[lastKey]) {
                        acc[lastKey] = [];
                    }
                    acc[lastKey].push(value);
                } else {
                    // Handle key-value pairs
                    const colonIndex = line.indexOf(':');
                    if (colonIndex !== -1) {
                        const key = line.slice(0, colonIndex).trim();
                        const value = line.slice(colonIndex + 1).trim();
                        acc[key] = value.replace(/^["'](.*)["']$/, '$1');
                    }
                }
                return acc;
            }, {});
            
            // Get content after frontmatter
            markdownContent = content.replace(frontmatterRegex, '');
        }
        
        const htmlContent = markdown.convert(markdownContent);
        
        if (frontmatter.permalink) {
            specialPageFiles.push({
                file,
                frontmatter,
                htmlContent
            });
        }
    });
    
    // Process special pages with permalinks
    specialPageFiles.forEach(({ file, frontmatter, htmlContent }) => {
        // Create HTML with or without styling based on no_style attribute
        let finalHTML;
        if (frontmatter.no_style === true || frontmatter.no_style === 'true') {
            // Use the no_style template
            const noStyleTemplate = fs.readFileSync(path.join(templateDir, 'no_style.html'), 'utf-8');
            finalHTML = replaceVariables(noStyleTemplate, {
                title: frontmatter.title || '',
                content: htmlContent
            });
        } else {
            // Use the standard template with main content replaced
            const templateHTML = fs.readFileSync(path.join(templateDir, 'index.html'), 'utf-8');
            const mainContentPattern = /<main>[\s\S]*?<\/main>/;
            const templateWithReplacedMain = templateHTML.replace(mainContentPattern, `<main>${htmlContent}</main>`);
                
            finalHTML = replaceVariables(templateWithReplacedMain, {
                title: frontmatter.title || '',
                header: headerHTML,
                menu: menuTemplate.replace(/{{#if isProject}}(.*?){{\/if}}/g, '')
            });
        }
        
        // Create directory structure for the permalink
        const permalink = frontmatter.permalink.startsWith('/') ? frontmatter.permalink.substring(1) : frontmatter.permalink;
        
        // Always use directory structure with index.html for clean URLs
        let outputPath;
        if (permalink.endsWith('/')) {
            outputPath = `${permalink}index.html`;
        } else {
            outputPath = `${permalink}/index.html`;
        }
        
        const outputFilePath = path.join(outputDir, outputPath);
        
        // Debug output
        console.log(`Processing file: ${file}`);
        console.log(`  Permalink: ${frontmatter.permalink}`);
        console.log(`  no_style: ${frontmatter.no_style}`);
        console.log(`  Output path: ${outputPath}`);
        console.log(`  Full output path: ${outputFilePath}`);
        
        // Ensure directory exists
        const outputDirPath = path.dirname(outputFilePath);
        if (!fs.existsSync(outputDirPath)) {
            fs.mkdirSync(outputDirPath, { recursive: true });
        }
        
        // Write the file
        fs.writeFileSync(outputFilePath, finalHTML);
    });

    // Copy CSS file
    fs.copyFileSync(
        path.join(stylesDir, 'main.css'),
        path.join(outputDir, 'main.css')
    );

    // Copy images
    const imagesDir = path.join(__dirname, 'src/images');
    if (fs.existsSync(imagesDir)) {
        fs.mkdirSync(path.join(outputDir, 'images'), { recursive: true });
        fs.readdirSync(imagesDir).forEach(file => {
            fs.copyFileSync(
                path.join(imagesDir, file),
                path.join(outputDir, 'images', file)
            );
        });
    }

    // Copy assets
    if (fs.existsSync(assetsDir)) {
        fs.mkdirSync(path.join(outputDir, 'assets'), { recursive: true });
        fs.readdirSync(assetsDir).forEach(file => {
            fs.copyFileSync(
                path.join(assetsDir, file),
                path.join(outputDir, 'assets', file)
            );
        });

        // Ensure modal.js is copied
        if (fs.existsSync(path.join(assetsDir, 'modal.js'))) {
            fs.copyFileSync(
                path.join(assetsDir, 'modal.js'),
                path.join(outputDir, 'assets', 'modal.js')
            );
        }
    }

    console.log('Build completed successfully!');
    
    // Start the server after successful build
    startServer();
}

build();