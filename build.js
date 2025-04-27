#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const http = require('http');
const markdown = require('./markdown');

class PathManager {
    constructor() {
        this.contentDir = path.join(__dirname, 'src/content');
        this.outputDir = path.join(__dirname, 'site');
        this.templateDir = path.join(__dirname, 'src/templates');
        this.stylesDir = path.join(__dirname, 'src/styles');
        this.assetsDir = path.join(__dirname, 'src/assets');
    }
}

class TemplateEngine {
    static replaceVariables(template, variables) {
        return Object.keys(variables).reduce((result, key) => {
            return result.replace(new RegExp(`{{${key}}}`, 'g'), variables[key]);
        }, template);
    }

    static parseFrontmatter(content) {
        const frontmatterRegex = /^---[\r\n]+([\s\S]*?)[\r\n]+---/;
        const match = content.match(frontmatterRegex);
        let frontmatter = {};
        let markdownContent = content;

        if (match) {
            frontmatter = match[1].split('\n').reduce((acc, line) => {
                line = line.trim();
                if (!line) return acc;

                if (line.startsWith('-')) {
                    const value = line.slice(1).trim();
                    const lastKey = Object.keys(acc).pop();
                    if (!acc[lastKey]) acc[lastKey] = [];
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
            }, {});

            markdownContent = content.replace(frontmatterRegex, '');
        }

        return { frontmatter, markdownContent };
    }
}

class AssetManager {
    constructor(paths) {
        this.paths = paths;
    }

    copyAssets() {
        // Copy CSS file
        fs.copyFileSync(
            path.join(this.paths.stylesDir, 'main.css'),
            path.join(this.paths.outputDir, 'main.css')
        );

        // Copy images
        const imagesDir = path.join(__dirname, 'src/images');
        if (fs.existsSync(imagesDir)) {
            fs.mkdirSync(path.join(this.paths.outputDir, 'images'), { recursive: true });
            fs.readdirSync(imagesDir).forEach(file => {
                fs.copyFileSync(
                    path.join(imagesDir, file),
                    path.join(this.paths.outputDir, 'images', file)
                );
            });
        }

        // Copy assets
        if (fs.existsSync(this.paths.assetsDir)) {
            fs.mkdirSync(path.join(this.paths.outputDir, 'assets'), { recursive: true });
            fs.readdirSync(this.paths.assetsDir).forEach(file => {
                fs.copyFileSync(
                    path.join(this.paths.assetsDir, file),
                    path.join(this.paths.outputDir, 'assets', file)
                );
            });
        }
    }
}

class Server {
    constructor(paths) {
        this.paths = paths;
        this.PORT = 1717;
    }

    start() {
        const server = http.createServer((req, res) => {
            let url = req.url;
            
            if (!path.extname(url) && !url.endsWith('/')) {
                url += '/';
            }
            
            if (url.endsWith('/')) {
                url += 'index.html';
            }
            
            let filePath = path.join(this.paths.outputDir, url === '/' ? 'index.html' : url);
            
            fs.readFile(filePath, (err, data) => {
                if (err) {
                    if (!path.extname(req.url)) {
                        const htmlFilePath = path.join(this.paths.outputDir, `${req.url}.html`);
                        fs.readFile(htmlFilePath, (htmlErr, htmlData) => {
                            if (htmlErr) {
                                res.writeHead(404);
                                res.end('File not found');
                                return;
                            }
                            res.writeHead(200, { 'Content-Type': 'text/html' });
                            res.end(htmlData);
                        });
                        return;
                    }
                    
                    res.writeHead(404);
                    res.end('File not found');
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
            });
        });

        server.listen(this.PORT, () => {
            console.log(`\nServer running at http://localhost:${this.PORT}`);
            console.log('Press Ctrl+C to stop the server');
        });
    }
}

class ContentBuilder {
    constructor(paths) {
        this.paths = paths;
    }

    buildIndexPage() {
        const indexTemplate = fs.readFileSync(path.join(this.paths.templateDir, 'index.html'), 'utf-8');
        const headerHTML = fs.readFileSync(path.join(this.paths.templateDir, 'header.html'), 'utf8');
        const menuTemplate = fs.readFileSync(path.join(this.paths.templateDir, 'menu.html'), 'utf8');
        
        const indexMdPath = path.join(this.paths.contentDir, 'index.md');
        const indexMdContent = fs.readFileSync(indexMdPath, 'utf-8');
        
        const { frontmatter, markdownContent } = TemplateEngine.parseFrontmatter(indexMdContent);
        
        const sections = this.processSections(markdownContent);
        
        const indexHTML = TemplateEngine.replaceVariables(indexTemplate, {
            title: frontmatter.title || 'Game Studio',
            header: headerHTML,
            menu: menuTemplate.replace(/{{#if isProject}}(.*?){{\/if}}/g, ''),
            sections: JSON.stringify(sections)
                .replace(/"content":"(.*?)"/g, (match, p1) => `"content":${JSON.stringify(p1)}`)
        });
        
        const eachSectionsRegex = /{{#each sections}}([\s\S]*?){{\/each}}/;
        const sectionTemplate = indexHTML.match(eachSectionsRegex)[1];
        const sectionsHTML = sections.map(section => {
            return sectionTemplate
                .replace(/{{this\.id}}/g, section.id)
                .replace(/{{this\.background}}/g, section.background)
                .replace(/{{this\.content}}/g, section.content);
        }).join('\n');
        
        const finalIndexHTML = indexHTML.replace(eachSectionsRegex, sectionsHTML);
        
        fs.writeFileSync(path.join(this.paths.outputDir, 'index.html'), finalIndexHTML);
    }

    processSections(markdownContent) {
        const sectionRegex = /(^|\n)# ([^\n]+)([^\n]*(?:\n(?!# )[^\n]*)*)/g;
        const sections = [];
        let match;

        while ((match = sectionRegex.exec(markdownContent)) !== null) {
            const title = match[2].trim();
            const content = match[3].trim();
            const id = title.toLowerCase().replace(/\s+us$/i, '').replace(/\s+/g, '');
            const background = sections.length % 2 === 0 ? 'light' : 'dark';

            if (id === 'contacts' && content.includes('---\ncontacts:')) {
                sections.push(this.processContactsSection(title, content, id, background));
            } else if (id === 'games') {
                sections.push(this.processGamesSection(title, id, background));
            } else {
                sections.push({
                    id,
                    background,
                    content: `<h1>${title}</h1>${markdown.convert(content)}`
                });
            }
        }

        return sections;
    }

    processContactsSection(title, content, id, background) {
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
            
            return { id, background, content: contactsHtml };
        }
        return { id, background, content: `<h1>${title}</h1>${markdown.convert(content)}` };
    }

    processGamesSection(title, id, background) {
        const gamesDir = path.join(this.paths.contentDir, 'games');
        let gamesHTML = `<h1>${title}</h1>`;
        
        if (fs.existsSync(gamesDir)) {
            const gameFiles = fs.readdirSync(gamesDir);
            const games = gameFiles.map(file => this.processGameFile(gamesDir, file));
            games.sort((a, b) => a.order - b.order);
            
            const gameGridHTML = games.map(game => `
                <div class="game">
                    <a href="/games/${game.name}/">
                        <img src="/assets/${game.frontmatter.preview_image}" alt="${game.name}">
                    </a>
                </div>
            `).join('\n');
            
            gamesHTML += `<div class="games-grid">${gameGridHTML}</div>`;
        }
        
        return { id, background, content: gamesHTML };
    }

    processGameFile(gamesDir, file) {
        const gameContent = fs.readFileSync(path.join(gamesDir, file), 'utf-8');
        const normalizedContent = gameContent.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
        const { frontmatter } = TemplateEngine.parseFrontmatter(normalizedContent);
        const gameName = path.basename(file, '.md');
        
        return {
            name: gameName,
            frontmatter,
            order: parseInt(frontmatter.order) || Infinity
        };
    }

    buildGamePages() {
        const gamesDir = path.join(this.paths.contentDir, 'games');
        if (!fs.existsSync(gamesDir)) return;

        const gameFiles = fs.readdirSync(gamesDir);
        const headerHTML = fs.readFileSync(path.join(this.paths.templateDir, 'header.html'), 'utf8');
        const menuTemplate = fs.readFileSync(path.join(this.paths.templateDir, 'menu.html'), 'utf8');
        const gameTemplate = fs.readFileSync(path.join(this.paths.templateDir, 'game.html'), 'utf8');
        const footerTemplate = fs.readFileSync(path.join(this.paths.templateDir, 'footer.html'), 'utf8');

        gameFiles.forEach(file => {
            const gameName = path.basename(file, '.md');
            const gameContent = fs.readFileSync(path.join(gamesDir, file), 'utf-8');
            const normalizedContent = gameContent.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
            const { frontmatter } = TemplateEngine.parseFrontmatter(normalizedContent);

            const mediaHTML = this.buildMediaHTML(frontmatter.media || []);
            const storeLinksHTML = this.buildStoreLinksHTML(frontmatter.store || []);

            const gameHTML = TemplateEngine.replaceVariables(gameTemplate, {
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

            const gameOutputDir = path.join(this.paths.outputDir, 'games', gameName);
            fs.mkdirSync(gameOutputDir, { recursive: true });
            fs.writeFileSync(path.join(gameOutputDir, 'index.html'), gameHTML);
        });
    }

    buildMediaHTML(mediaItems) {
        return mediaItems.map(url => {
            if (url.includes('youtube.com')) {
                return `
                    <div class="game media-item">
                        <div class="media-overlay" data-media-type="video" data-media-url="${url.replace('watch?v=', 'embed/')}"></div>
                        <iframe src="${url.replace('watch?v=', 'embed/')}" frameborder="0" allowfullscreen></iframe>
                    </div>`;
            }
            return `
                <div class="game media-item">
                    <div class="media-overlay" data-media-type="image" data-media-url="/assets/${url}"></div>
                    <img src="/assets/${url}" alt="Screenshot">
                </div>`;
        }).join('');
    }

    buildStoreLinksHTML(storeLinks) {
        if (storeLinks.length === 0) return '';
        
        const fixedStoreLinks = storeLinks.map(store => 
            store.replace(/!\[\]\(([^\/].*?\.png)\)/g, '![](/assets/$1)')
        ).join(' ');
        
        return `<div class="store-links-wrapper">${markdown.convert(fixedStoreLinks)}</div>`;
    }

    buildSpecialPages() {
        const specialPageFiles = [];
        const headerHTML = fs.readFileSync(path.join(this.paths.templateDir, 'header.html'), 'utf8');
        const menuTemplate = fs.readFileSync(path.join(this.paths.templateDir, 'menu.html'), 'utf8');

        fs.readdirSync(this.paths.contentDir).forEach(file => {
            if (!file.endsWith('.md') || file === 'index.md') return;

            const content = fs.readFileSync(path.join(this.paths.contentDir, file), 'utf-8');
            const { frontmatter, markdownContent } = TemplateEngine.parseFrontmatter(content);
            const htmlContent = markdown.convert(markdownContent);

            if (frontmatter.permalink) {
                specialPageFiles.push({ file, frontmatter, htmlContent });
            }
        });

        specialPageFiles.forEach(({ file, frontmatter, htmlContent }) => {
            let finalHTML;
            if (frontmatter.no_style === true || frontmatter.no_style === 'true') {
                const noStyleTemplate = fs.readFileSync(path.join(this.paths.templateDir, 'no_style.html'), 'utf-8');
                finalHTML = TemplateEngine.replaceVariables(noStyleTemplate, {
                    title: frontmatter.title || '',
                    content: htmlContent
                });
            } else {
                const templateHTML = fs.readFileSync(path.join(this.paths.templateDir, 'index.html'), 'utf-8');
                const mainContentPattern = /<main>[\s\S]*?<\/main>/;
                const templateWithReplacedMain = templateHTML.replace(mainContentPattern, `<main>${htmlContent}</main>`);
                    
                finalHTML = TemplateEngine.replaceVariables(templateWithReplacedMain, {
                    title: frontmatter.title || '',
                    header: headerHTML,
                    menu: menuTemplate.replace(/{{#if isProject}}(.*?){{\/if}}/g, '')
                });
            }

            const permalink = frontmatter.permalink.startsWith('/') ? frontmatter.permalink.substring(1) : frontmatter.permalink;
            const outputPath = permalink.endsWith('/') ? `${permalink}index.html` : `${permalink}/index.html`;
            const outputFilePath = path.join(this.paths.outputDir, outputPath);

            fs.mkdirSync(path.dirname(outputFilePath), { recursive: true });
            fs.writeFileSync(outputFilePath, finalHTML);
        });
    }
}

class BuildManager {
    constructor() {
        this.paths = new PathManager();
        this.assetManager = new AssetManager(this.paths);
        this.contentBuilder = new ContentBuilder(this.paths);
        this.server = new Server(this.paths);
    }

    build() {
        if (!fs.existsSync(this.paths.outputDir)) {
            fs.mkdirSync(this.paths.outputDir, { recursive: true });
        }

        this.contentBuilder.buildIndexPage();
        this.contentBuilder.buildGamePages();
        this.contentBuilder.buildSpecialPages();
        this.assetManager.copyAssets();

        console.log('Build completed successfully!');
        this.server.start();
    }
}

// Execute build
new BuildManager().build();