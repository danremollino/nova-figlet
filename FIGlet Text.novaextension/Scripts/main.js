/**
 * Convert the supplied text to FIGlet format
 *
 * @param workspace - Workspace, default first argument, see Nova extension docs
                      https://docs.nova.app/api-reference/commands-registry/#registername-callable-thisvalue
 * @param figletArgs - key/value obj, command line arguments for FIGlet configuration
 * @param textToConvert - str, the text to convert with FIGlet
 * @param postConversion - func, callback to run on the figlet converted text string,
                           receives the FIGlet converted string as an argument;
                           output/modification of the FIGlet text should be done here
 * @returns a Disposable, see Nova extension docs https://docs.nova.app/api-reference/disposable/
 */
nova.commands.register('figlet', (workspace, figletArgs, textToConvert, postConversion) => {
    let args = ['figlet']
    for (const arg in figletArgs) {
        args.push(figletArgs[arg])
    }
    args.push(textToConvert)

    const process = new Process('/usr/bin/env', {args})

    let figTextArr = []
    process.onStdout(line => {
        // test if a line contains only whitespace, some
        // FIGlet fonts will add a line or two for fun
        if (!/^\s+$/.test(line)) {
            figTextArr.push(line)
        }
    })

    let figTextStr = ''
    process.onDidExit(status => {
        if (status === 0) {
            // trim any whitespace from the end of each line; FIGlet seems
            // to add a single column of whitespace more than what is required
            figTextArr = figTextArr.map(line => { return line.trimEnd() })

            // convert to a string
            figTextStr = figTextArr.join('\n')
            postConversion(figTextStr)
        }
    })

    process.start()
})

// FIGlet convert the selected text in the editor
nova.commands.register('figletTextEditor', editor => {
    let figConfig = {
        font:            '-f' + nova.config.get('figlet_text.font', 'string'),
        outputWidth:     '-w' + nova.config.get('figlet_text.outputWidth', 'number'),
        textDirection:   nova.config.get('figlet_text.textDirection', 'string'),
        justification:   nova.config.get('figlet_text.justification', 'string'),
    }

    let syntax = editor.document.syntax
    let comment = nova.config.get('figlet_text.comment', 'boolean')
    let commentPadding = nova.config.get('figlet_text.commentPadding', 'number')
    let commentPaddingStr = nova.config.get('figlet_text.commentPaddingStr', 'string')
    let commentChars = {
        css: {start: '/*', end: '*/'},
        html: {start: '<!--', end: '-->'},
        javascript: {start: '//', end: ''},
        php: {start: '//', end: ''}
    }
    let prependNewLines = nova.config.get('figlet_text.prependNewLines', 'number')
    let appendNewLines = nova.config.get('figlet_text.appendNewLines', 'number')

    let selectedRanges = editor.selectedRanges.reverse()

    for (let range of selectedRanges) {
        let text = editor.getTextInRange(range)

        nova.commands.invoke('figlet', figConfig, text, figletText => {
            // comment each line if the option is selected
            if (comment && (syntax === 'css' || syntax === 'html' || syntax === 'javascript' || syntax === 'php')) {
                let lines = figletText.split('\n')

                let longestLine = 0
                lines.map(line => {
                    if (line.length > longestLine) longestLine = line.length
                })

                let linesCommented = lines.map(line => {
                    let linePadding = 0
                    if (line.length < longestLine && (commentChars[syntax].end !== '')) linePadding = longestLine - line.length
                    return `${commentChars[syntax].start}${commentPaddingStr.repeat(commentPadding)}${line}${' '.repeat(linePadding)}${commentPaddingStr.repeat(commentPadding)}${commentChars[syntax].end}`.trimEnd()
                })

                figletText = linesCommented.join('\n')
            }

            // prepend/append new lines
            if (prependNewLines > 0) figletText = `${'\n'.repeat(prependNewLines)}${figletText}`
            if (appendNewLines > 0) figletText = `${figletText}${'\n'.repeat(appendNewLines)}`

            // replace the selection with the converted/transformed FIGlet text
            editor.edit(e => { e.replace(range, figletText) })

            // deselect and position the cursor
            editor.moveRight(1)
        })
    }
})

// FIGlet convert the preview text in the extension config
nova.commands.register('figletTextFontPreview', workspace => {
    let figConfig = {
        kerning: '-k',
        outputWidth: '-w' + 2000,
        font: '-f' + nova.config.get('figlet_text.font', 'string')
    }

    let text = nova.config.get('figlet_text.previewText', 'string')

    nova.commands.invoke('figlet', figConfig, text, figletText => {
        nova.config.set('figlet_text.preview', figletText)
    })
})
// listen for changes to the Font selection dropdown in the extension config
nova.config.onDidChange('figlet_text.font', (newValue, oldValue) => {
    nova.commands.invoke('figletTextFontPreview')
})
// listen for changes to the Preview Text input in the extension config
nova.config.onDidChange('figlet_text.previewText', (newValue, oldValue) => {
    nova.commands.invoke('figletTextFontPreview')
})
