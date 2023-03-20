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
            // the converted text from FIGlet as a string
            figTextStr = figTextArr.join('').trimEnd()
            postConversion(figTextStr)
        }
    })

    process.start()
})

// FIGlet convert the selected text in the editor
nova.commands.register('createFigletText', editor => {
    // console.log(editor.document.syntax)

    let printNewLines = numOfLines => {
        let newLinesStr = ''
        while (numOfLines > 0) {
            newLinesStr += '\n'
            numOfLines--
        }
        return newLinesStr
    }

    let figConfig = {
        font:            '-f' + nova.config.get('figlet_text.font', 'string'),
        outputWidth:     '-w' + nova.config.get('figlet_text.outputWidth', 'number'),
        textDirection:   nova.config.get('figlet_text.textDirection', 'string'),
        justification:   nova.config.get('figlet_text.justification', 'string'),
    }

    let prependNewLines = nova.config.get('figlet_text.prependNewLines', 'number')
    let appendNewLines = nova.config.get('figlet_text.appendNewLines', 'number')

    let selectedRanges = editor.selectedRanges.reverse()

    for (let range of selectedRanges) {
        let text = editor.getTextInRange(range)

        nova.commands.invoke('figlet', figConfig, text, figletText => {
            // // prepend/append new lines
            if (appendNewLines > 0) { figletText = figletText.concat(printNewLines(figConfig.appendNewLines)) }
            if (prependNewLines > 0) { figletText = printNewLines(figConfig.prependNewLines).concat(figletText) }

            // replace the selection with the converted FIGlet text
            editor.edit(e => {
                e.replace(range, figletText)
            })

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
