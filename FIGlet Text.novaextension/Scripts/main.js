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

    let comment = nova.config.get('figlet_text.comment', 'boolean')
    let commentPadding = nova.config.get('figlet_text.commentPadding', 'number')
    let commentPaddingStr = nova.config.get('figlet_text.commentPaddingStr', 'string')
    const getCommentChars = () => {
        switch (editor.document.syntax) {
            case 'css':
            case 'scss':
                return {start: '/*', end: '*/'}
            case 'html':
                return {start: '<!--', end: '-->'}
            case 'javascript':
            case 'typescript':
            case 'php':
                return {start: '//', end: ''}
            default:
                return null
        }
    }

    // subtract one; will Array.prototype.join('\n') before final editor output
    let prependNewLines = nova.config.get('figlet_text.prependNewLines', 'number') - 1
    let appendNewLines = nova.config.get('figlet_text.appendNewLines', 'number') - 1

    let selectedRanges = editor.selectedRanges.reverse()

    for (let range of selectedRanges) {
        let text = editor.getTextInRange(range)
        let indentRange = new Range(editor.getLineRangeForRange(range).start, range.start)
        let indentText = editor.getTextInRange(indentRange)

        nova.commands.invoke('figlet', figConfig, text, figletText => {
            // convert the FIGlet string to an array of strings to make it
            // easier to modify line by line; order of transformations matter
            let figletTextArr = figletText.split('\n')

            // comment each line if the option is selected and a
            // comment structure is defined for the current syntax
            if (comment && getCommentChars() !== null) {
                // find the longest line so we can add whitespace to shorter
                // lines so closing comments line up if the syntax uses them
                let longestLine = 0
                figletTextArr.map(line => { if (line.length > longestLine) longestLine = line.length })

                // add the comment characters, lengthen lines with closing
                // comments, and add user configured comment padding
                figletTextArr = figletTextArr.map(line => {
                    let linePadding = 0
                    if (line.length < longestLine && (getCommentChars().end !== '')) linePadding = longestLine - line.length

                    // return the fully commented and formatted array of strings
                    return `${getCommentChars().start}${commentPaddingStr.repeat(commentPadding)}${line}${' '.repeat(linePadding)}${commentPaddingStr.repeat(commentPadding)}${getCommentChars().end}`.trimEnd()
                })
            }

            // prepend/append new lines
            if (prependNewLines > 0) figletTextArr = Array.of(`${'\n'.repeat(prependNewLines)}`).concat(figletTextArr)
            if (appendNewLines > 0) figletTextArr = figletTextArr.concat(Array.of(`${'\n'.repeat(appendNewLines)}`))

            // indent subsequent lines after the line
            // with an initial indented selection
            if (!indentRange.empty) {
                figletTextArr = figletTextArr.map((line, index) => {
                    if (index === 0) {
                        return `${line}`
                    } else {
                        return `${indentText}${line}`
                    }
                })
            }

            // convert the array of strings to a
            // single string for output to editor
            let figletTextStr = figletTextArr.join('\n')

            // replace the selection with the fully transformed FIGlet text
            editor.edit(e => { e.replace(range, figletTextStr) })

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
