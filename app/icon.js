import { ImageResponse } from 'next/og';
import { LuBox } from 'react-icons/lu';

// Route segment config
export const runtime = 'edge';

// Image metadata
export const size = {
    width: 32,
    height: 32,
};
export const contentType = 'image/png';

// Image generation
export default function Icon() {
    return new ImageResponse(
        (
            // ImageResponse JSX element
            <div
                style={{
                    fontSize: 24,
                    background: 'transparent',
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#000000', // Black icon
                }}
            >
                <LuBox />
            </div>
        ),
        // ImageResponse options
        {
            ...size,
        }
    );
}
