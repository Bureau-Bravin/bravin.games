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
        let filePath = path.join(outputDir, req.url === '/' ? 'index.html' : req.url);
        
        fs.readFile(filePath, (err, data) => {
            if (err) {
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

    // Read template
    const template = fs.readFileSync(path.join(templateDir, 'index.html'), 'utf-8');

    // Read header template directly without markdown processing
    const headerHTML = fs.readFileSync(path.join(templateDir, 'header.html'), 'utf8');

    // Read and process the about section
    const aboutContent = fs.readFileSync(path.join(contentDir, 'about.md'), 'utf-8');
    const aboutHTML = markdown.convert(aboutContent);

    // Read and process the contacts section
    const contactsContent = fs.readFileSync(path.join(contentDir, 'contacts.md'), 'utf-8');
    
    // Parse frontmatter from contacts.md
    const contactsFrontmatterRegex = /^---[\r\n]+([\s\S]*?)[\r\n]+---/;
    const contactsMatch = contactsContent.match(contactsFrontmatterRegex);
    const contactsFrontmatter = contactsMatch ? contactsMatch[1].split('\n').reduce((acc, line) => {
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
                // Remove quotes if they exist
                acc[key] = value.replace(/^["'](.*)["']$/, '$1');
            }
        }
        return acc;
    }, {}) : {};
    
    // Get the markdown content after frontmatter
    const contactsMarkdown = contactsContent.replace(contactsFrontmatterRegex, '');
    
    // Format social links similar to store_block
    const socialLinksBlock = contactsFrontmatter.contacts ? 
        `<div class="store-links"><div class="store-links-wrapper">${
            markdown.convert(contactsFrontmatter.contacts.join(' ').replace(/\!\[\]\((.*?\.png)\)/g, '![](/assets/$1)'))
        }</div></div>` : '';
    
    // Combine the markdown content with the social links
    const contactsHTML = markdown.convert(contactsMarkdown) + socialLinksBlock;

    // Read and process project files
    const projectDir = path.join(contentDir, 'projects');
    const projectFiles = fs.readdirSync(projectDir);
    
    const projectsHTML = projectFiles.map(file => {
        const projectContent = fs.readFileSync(path.join(projectDir, file), 'utf-8');
        
        // Remove BOM and normalize line endings
        const normalizedContent = projectContent.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
        
        // Parse frontmatter with more flexible regex
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
                    // Remove quotes if they exist
                    acc[key] = value.replace(/^["'](.*)["']$/, '$1');
                }
            }
            return acc;
        }, {}) : {};

        const projectName = path.basename(file, '.md');
        return `
            <div class="project">
                <a href="/projects/${projectName}.html">
                    <img src="/assets/${frontmatter.preview_image}" alt="${projectName}">
                </a>
            </div>
        `;
    }).join('\n');

    // Read header and footer templates
    const footerTemplate = fs.readFileSync(path.join(templateDir, 'footer.html'), 'utf8');

    // When generating individual project pages
    projectFiles.forEach(file => {
        const projectContent = fs.readFileSync(path.join(projectDir, file), 'utf-8');
        const normalizedContent = projectContent.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
        
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

        // Generate media HTML if media exists
        const mediaHTML = frontmatter.media ? frontmatter.media.map((url, index) => {
            if (url.includes('youtube.com')) {
                return `
                    <div class="project media-item">
                        <div class="media-overlay" data-media-type="video" data-media-url="${url.replace('watch?v=', 'embed/')}"></div>
                        <iframe src="${url.replace('watch?v=', 'embed/')}" frameborder="0" allowfullscreen></iframe>
                    </div>`;
            }
            return `
                <div class="project media-item">
                    <div class="media-overlay" data-media-type="image" data-media-url="/assets/${url}"></div>
                    <img src="/assets/${url}" alt="Screenshot">
                </div>`;
        }).join('\n') : '';

        // Create project page using template
        const projectTemplate = fs.readFileSync(path.join(templateDir, 'project.html'), 'utf8');
        const finalProjectHTML = replaceVariables(projectTemplate, {
            title: frontmatter.title || '',
            title_block: frontmatter.title ? `<h1>${frontmatter.title}</h1>` : '',
            release_block: frontmatter.release_data ? `<div class="release-date">Released: ${frontmatter.release_data}</div>` : '',
            store_block: frontmatter.store ? `<div class="store-links"><div class="store-links-wrapper">${
                markdown.convert(frontmatter.store.join(' ').replace(/\!\[\]\((.*?\.png)\)/g, '![](/assets/$1)'))
            }</div></div>` : '',
            description_block: frontmatter.description ? `<div class="description">${frontmatter.description}</div>` : '',
            media_block: mediaHTML ? `<div class="projects-grid">${mediaHTML}</div>` : '',
            header: headerHTML,
            footer: footerTemplate
        });

        // Create projects directory if it doesn't exist
        const projectsOutputDir = path.join(outputDir, 'projects');
        if (!fs.existsSync(projectsOutputDir)) {
            fs.mkdirSync(projectsOutputDir, { recursive: true });
        }

        // Write project page
        const outputFile = path.join(projectsOutputDir, `${path.basename(file, '.md')}.html`);
        fs.writeFileSync(outputFile, finalProjectHTML);
    });

    // Replace variables in template
    const finalHTML = replaceVariables(template, {
        title: 'Game Studio',
        header: headerHTML,
        about: aboutHTML,
        projects: projectsHTML,
        contacts: contactsHTML
    });

    // Write final HTML
    fs.writeFileSync(path.join(outputDir, 'index.html'), finalHTML);

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